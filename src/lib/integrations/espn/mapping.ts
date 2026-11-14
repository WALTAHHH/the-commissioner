/**
 * ESPN display mapping — external role lookup (informational only).
 *
 * Everything here reads the snapshot `syncESPNLeague` already wrote to
 * `integration_sync_log.raw_snapshot` (shape: `{ league, members, rosters,
 * matchups }`, where `league` is the normalized `ESPNLeague` and keeps the
 * untouched API payload on `league.raw`). No live ESPN call and no new sync:
 * when there is no snapshot, or it says nothing about roles, these helpers
 * return null and the page renders nothing at all.
 *
 * ROLE SEMANTICS (verified live against ESPN league 1241838 / 2024 on
 * 2026-11-14):
 *  - `view=fll` sends `members[].isLeagueManager` (boolean) — that is ESPN's
 *    manager/commissioner flag, and in an anonymous read every member of that
 *    league came back `false`, so treat "a boolean is present" as the signal
 *    that the payload can distinguish managers at all.
 *  - `view=mTeam` + `view=mSettings` — the views the ESPN sync currently
 *    requests — carry NO manager flag and no league-level owner id, only
 *    `teams[].owners` / `teams[].primaryOwner`. So a snapshot with no manager
 *    metadata can identify owners but cannot separate the commissioner from a
 *    member: we return null rather than guess (and the field stays hidden).
 *
 * SECURITY: the ESPN user id we match on is the connection's stored `swid`
 * cookie — a credential. It is read only inside `getMyESPNRoleForViewer`
 * (server-only), used for one comparison, and never returned, logged or
 * rendered; the only value that leaves this module is a role label. The
 * `swid` column is deliberately absent from `IntegrationConnectionView`, so
 * this module reads the table directly instead of going through
 * `getProviderConnection`.
 */
import { db } from '@/src/lib/db'
import { normalizeCookieValue } from './snapshot'

/**
 * Same label set as `../sleeper/mapping.ts`. Re-declared here on purpose so
 * neither provider module has to import the other.
 */
export type ExternalRole = 'Commissioner' | 'Co-Commissioner' | 'Member'

/** Per-member boolean flags ESPN has used for the league manager. */
const MANAGER_FLAG_KEYS = ['isLeagueManager', 'isCommissioner'] as const
/** Flags for a secondary manager. Absent from today's payload; read anyway. */
const CO_MANAGER_FLAG_KEYS = ['isCoLeagueManager', 'isCoCommissioner', 'coCommissioner'] as const
/** League-level keys that would name the manager directly. */
const COMMISSIONER_ID_KEYS = ['ownerId', 'commissionerId', 'commissionerSwid'] as const
const CO_COMMISSIONER_IDS_KEYS = ['coCommissioners', 'coCommissionerIds', 'coManagerIds'] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function trueFlag(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => record[key] === true)
}

/**
 * Canonical form of an ESPN user id for comparison.
 *
 * ESPN owner ids arrive as `{3A2C2DB2-7702-429A-8C0E-BC6C84DAA2EF}` while a
 * pasted SWID cookie is the same GUID possibly quoted, `SWID=`-prefixed, with
 * or without braces, and in either case. `normalizeCookieValue` handles the
 * paste shapes, then we drop braces and case.
 */
export function normalizeESPNUserId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const cleaned = normalizeCookieValue(String(value), 'SWID')
    .replace(/[{}]/g, '')
    .trim()
  return cleaned === '' ? null : cleaned.toUpperCase()
}

/**
 * ESPN `settings` is an object in FFL but a `{name, value}` array in other
 * ESPN games/seasons. Read a key through both shapes.
 */
function settingsValue(settings: unknown, key: string): unknown {
  const list = asArray(settings)
  if (list.length > 0) {
    for (const entry of list) {
      const row = asRecord(entry)
      if (row && asString(row.name)?.toLowerCase() === key.toLowerCase()) return row.value
    }
    return undefined
  }
  const obj = asRecord(settings)
  return obj ? obj[key] : undefined
}

/** Every member record the snapshot carries (raw payload first, normalized rows after). */
function memberRecords(snapshot: Record<string, unknown>): Array<Record<string, unknown>> {
  const league = asRecord(snapshot.league)
  const raw = asRecord(league?.raw)
  const lists = [asArray(raw?.members), asArray(league?.members), asArray(snapshot.members)]
  const records: Array<Record<string, unknown>> = []
  for (const list of lists) {
    for (const entry of list) {
      const member = asRecord(entry)
      if (member) records.push(member)
    }
  }
  return records
}

/** Owner ids from `teams[].owners` + `teams[].primaryOwner` across the snapshot. */
function ownerIds(snapshot: Record<string, unknown>): Set<string> {
  const league = asRecord(snapshot.league)
  const raw = asRecord(league?.raw)
  const teamLists = [asArray(raw?.teams), asArray(league?.teams)]
  const ids = new Set<string>()
  for (const teams of teamLists) {
    for (const entry of teams) {
      const team = asRecord(entry)
      if (!team) continue
      for (const owner of asArray(team.owners)) {
        const id = normalizeESPNUserId(owner)
        if (id) ids.add(id)
      }
      const primary = normalizeESPNUserId(team.primaryOwner)
      if (primary) ids.add(primary)
    }
  }
  return ids
}

/**
 * The current user's role on ESPN, from an already-stored snapshot.
 *
 * @param snapshot the `raw_snapshot` value of an `integration_sync_log` row
 *   (anything — a malformed or partial payload degrades to null, never throws).
 * @param swid the viewer's ESPN user id (usually their stored SWID cookie value).
 * @returns 'Commissioner' | 'Co-Commissioner' | 'Member', or null when the
 *   role cannot be determined — no snapshot, no id, user not in the league, or
 *   a payload that cannot tell managers apart from members.
 *
 * Informational only: nothing here reads or writes our own roles/permissions.
 */
export function getMyESPNRole(snapshot: unknown, swid: unknown): ExternalRole | null {
  try {
    const root = asRecord(snapshot)
    const me = normalizeESPNUserId(swid)
    if (!root || !me) return null

    // If snapshot already carries a pre-computed role, trust it.
    const storedRole = root.myRole
    if (storedRole === 'Commissioner' || storedRole === 'Member' || storedRole === 'Co-Commissioner') {
      return storedRole
    }

    const members = memberRecords(root)
    const teams = ownerIds(root)
    const isMemberOfLeague =
      members.some((m) => normalizeESPNUserId(m.id) === me) || teams.has(me)

    // Per-member flags: my own record wins, then any record that names me.
    const myRecords = members.filter((m) => normalizeESPNUserId(m.id) === me)
    for (const record of myRecords) {
      if (trueFlag(record, CO_MANAGER_FLAG_KEYS)) return 'Co-Commissioner'
      if (trueFlag(record, MANAGER_FLAG_KEYS)) return 'Commissioner'
    }

    // League-level manager ids, if ESPN ever ships them in this payload.
    const league = asRecord(root.league)
    const raw = asRecord(league?.raw)
    const settings = raw?.settings ?? league?.settings
    for (const key of COMMISSIONER_ID_KEYS) {
      const owner = normalizeESPNUserId(settingsValue(settings, key))
      if (owner && owner === me) return 'Commissioner'
    }
    for (const key of CO_COMMISSIONER_IDS_KEYS) {
      const list = asArray(settingsValue(settings, key)).map(normalizeESPNUserId)
      if (list.includes(me)) return 'Co-Commissioner'
    }

    if (!isMemberOfLeague) return null

    // 'Member' is only safe when the payload can actually identify a manager:
    // with no manager metadata at all, everybody looks like a member — including
    // the real commissioner — so we say nothing instead of something wrong.
    const managerMetadataPresent = members.some((m) =>
      [...MANAGER_FLAG_KEYS, ...CO_MANAGER_FLAG_KEYS].some(
        (key) => typeof m[key] === 'boolean',
      ),
    )
    return managerMetadataPresent ? 'Member' : null
  } catch (err) {
    // A render-path helper must never take a page down.
    console.error('getMyESPNRole failed:', err)
    return null
  }
}

/**
 * Viewer's ESPN role for a league, or null when it is not determinable.
 *
 * Gate: the stored `swid` belongs to whoever connected the league
 * (`integration_connections.created_by`), not to every viewer, so for anyone
 * other than that account the role is not ours to report and we return null —
 * the page then omits the field entirely rather than showing somebody else's
 * role under "Your".
 *
 * Returns a label only. The cookie value never leaves this function.
 */
export async function getMyESPNRoleForViewer(
  leagueId: string,
  viewerUserId: string,
): Promise<ExternalRole | null> {
  try {
    const { data: connection, error: connectionError } = await db
      .from('integration_connections')
      .select('id, status, created_by, swid')
      .eq('league_id', leagueId)
      .eq('provider', 'espn')
      .maybeSingle()

    if (connectionError) {
      console.error('getMyESPNRoleForViewer connection lookup failed:', connectionError)
      return null
    }

    const row = asRecord(connection)
    if (!row || asString(row.status) !== 'active') return null
    if (asString(row.created_by) !== viewerUserId) return null

    const swid = normalizeESPNUserId(row.swid)
    if (!swid) return null

    const { data: log, error: logError } = await db
      .from('integration_sync_log')
      .select('id, raw_snapshot')
      .eq('connection_id', row.id)
      .eq('status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (logError) {
      console.error('getMyESPNRoleForViewer sync-log lookup failed:', logError)
      return null
    }

    const logRow = asRecord(log)
    return getMyESPNRole(logRow?.raw_snapshot, swid)
  } catch (err) {
    console.error('getMyESPNRoleForViewer unexpected error:', err)
    return null
  }
}
