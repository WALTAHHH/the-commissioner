/**
 * Teams view matching (t_84a46c7f).
 *
 * Builds the consolidated "team ⇄ member" picture the Teams view renders:
 * integration teams (from the LAST sync snapshot) matched against our
 * `league_members` rows, plus everyone/everything that did not match.
 *
 * Hard rules from the spec:
 *  - READ-ONLY. No live Sleeper/ESPN API calls and no sync triggered on this
 *    path; everything comes from `integration_sync_log.raw_snapshot` rows
 *    already written by `syncSleeperLeague` / `syncESPNLeague`.
 *  - Supabase JS client only (`db` from src/lib/db.ts).
 *
 * Matching story (same reality as `sleeper/mapping.ts` documents): external
 * user ids have no declared link to our auth users, EXCEPT the ESPN case the
 * spec calls out — the connection row's stored SWID is the ESPN user id of the
 * account that connected the league (`created_by`), so the team whose
 * `primaryOwner` equals that SWID is claimed to belong to that auth user's
 * membership row. Everyone else is matched best-effort:
 *   1. forced link (ESPN SWID ⇄ created_by membership) — always applied first;
 *   2. unique owner-display-name ⇄ member-display-name hit;
 *   3. unique member `team_name` ⇄ integration team name hit.
 * A "unique hit" means exactly one candidate on BOTH sides; anything
 * ambiguous is left unmatched and surfaces as a warning card rather than a
 * wrong pairing (the same conservative rule the Sleeper display mapper uses).
 *
 * Platform role labels follow the live-verified flag semantics from the
 * external-role work: Sleeper marks its league owner with `is_owner`; ESPN's
 * views we sync today may carry `isLeagueManager`/`isCommissioner` per member
 * or may carry nothing at all — when nothing distinguishes the commissioner
 * we say nothing (null) rather than guessing.
 */
import { db } from '@/src/lib/db'
import { listDirectoryMembers, type MemberRow } from '@/src/lib/dashboard'
import { displayName } from '@/src/lib/display'
import { listLeagueConnections } from './connections'
import { normalizeCookieValue } from './espn/snapshot'
import {
  normalizeDisplayName,
  parseSleeperSnapshot,
  sleeperTeamName,
  type SleeperSnapshot,
} from './sleeper/mapping'
import type { SleeperMember } from './sleeper/types'

// ---------- view types ----------

export type TeamMatchStatus = 'matched' | 'unmatched_team' | 'unmatched_member'

export type IntegrationTeamOwner = {
  /** External user id (Sleeper user_id / ESPN owner SWID GUID). */
  externalId: string
  displayName: string | null
}

/** One team as the integration snapshot describes it. */
export type IntegrationTeam = {
  provider: string
  /** External team id as string (Sleeper roster_id, ESPN team id). */
  externalId: string
  teamName: string | null
  ownerExternalId: string | null
  ownerDisplayName: string | null
  /**
   * The owner's role on the EXTERNAL platform when the snapshot makes it
   * explicit ('Commissioner' | 'Co-Commissioner'); null when the payload
   * cannot tell, or the owner is a plain member.
   */
  platformRole: string | null
  /** Team co-owners (Sleeper roster co_owners / ESPN non-primary owners). */
  coOwners: IntegrationTeamOwner[]
}

/** The subset of our directory row the Teams view renders. */
export type MatchableMember = {
  id: string
  /** auth.users id, when the row has a real account behind it. */
  userId: string | null
  displayName: string
  email: string | null
  /** Our system role (`league_members.role`). */
  role: string
  teamName: string | null
}

export type TeamMatchResult = {
  team: IntegrationTeam | null
  member: MatchableMember | null
  matchStatus: TeamMatchStatus
}

export type TeamMatchingOutcome = {
  /** Provider of the league's active integration, null when none. */
  provider: string | null
  /** True when a usable sync snapshot was found for that integration. */
  snapshotLoaded: boolean
  /** When the snapshot row was written (null without a snapshot). */
  lastSyncedAt: Date | null
  results: TeamMatchResult[]
}

// ---------- pure helpers ----------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Canonical form of an ESPN user id for comparison. ESPN owner ids arrive as
 * `{3A2C2DB2-…}`; a stored SWID cookie is the same GUID, possibly quoted or
 * `SWID=`-prefixed (normalizeCookieValue handles both), with or without
 * braces, in either case. Braces and case are not meaningful.
 */
export function normalizeESPNUserId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const cleaned = normalizeCookieValue(String(value), 'SWID')
    .replace(/[{}]/g, '')
    .trim()
  return cleaned === '' ? null : cleaned.toUpperCase()
}

// ---------- platform roles ----------

/** Sleeper league-manager flags beyond `is_owner` (read defensively). */
const SLEEPER_CO_MANAGER_KEYS = ['is_co_owner', 'is_co_manager', 'isLeagueManager'] as const

/**
 * Owner's role on Sleeper per the snapshot. Sleeper's users payload marks the
 * league owner with `is_owner`; co-manager keys are read in case a payload
 * ever carries one. Everyone else is null — a "Member" badge on every card
 * would be noise, and the spec only asks for leader-role badges.
 */
export function sleeperPlatformRole(member: SleeperMember | undefined): string | null {
  if (!member) return null
  if (member.isOwner === true || member.raw?.is_owner === true) return 'Commissioner'
  for (const source of [member.raw, member.metadata] as Array<Record<string, unknown> | null>) {
    if (!source || typeof source !== 'object') continue
    if (SLEEPER_CO_MANAGER_KEYS.some((key) => source[key] === true)) return 'Co-Commissioner'
  }
  return null
}

/** ESPN manager flags (same key set as the external-role work). */
const ESPN_MANAGER_FLAG_KEYS = ['isLeagueManager', 'isCommissioner'] as const
const ESPN_CO_MANAGER_FLAG_KEYS = ['isCoLeagueManager', 'isCoCommissioner', 'coCommissioner'] as const

/** Per-member raw record flags → platform role label, or null. */
export function espnPlatformRoleFromRecord(record: Record<string, unknown> | null): string | null {
  if (!record) return null
  if (ESPN_CO_MANAGER_FLAG_KEYS.some((key) => record[key] === true)) return 'Co-Commissioner'
  if (ESPN_MANAGER_FLAG_KEYS.some((key) => record[key] === true)) return 'Commissioner'
  return null
}

// ---------- snapshot → teams ----------

/**
 * Sleeper normalized snapshot → one IntegrationTeam per roster. Roster
 * co_owners (user ids on the raw roster payload) resolve to display names via
 * the snapshot's member list. Never throws; a roster without an owner id in
 * the member list simply renders without owner name/role.
 */
export function sleeperTeamsFromSnapshot(snapshot: SleeperSnapshot): IntegrationTeam[] {
  const memberById = new Map<string, SleeperMember>()
  for (const m of snapshot.members ?? []) {
    if (m && isNonEmptyString(m.externalId)) memberById.set(m.externalId, m)
  }

  const teams: IntegrationTeam[] = []
  for (const roster of snapshot.rosters ?? []) {
    if (!roster) continue
    const ownerMember = memberById.get(roster.ownerExternalId)
    const coOwnerIds = asArray(roster.raw?.co_owners).filter(isNonEmptyString)
    teams.push({
      provider: 'sleeper',
      externalId: String(roster.externalId),
      teamName: sleeperTeamName(roster),
      ownerExternalId: isNonEmptyString(roster.ownerExternalId) ? roster.ownerExternalId : null,
      ownerDisplayName: ownerMember?.displayName ?? null,
      platformRole: sleeperPlatformRole(ownerMember),
      coOwners: coOwnerIds.map((id) => ({
        externalId: id,
        displayName: memberById.get(id)?.displayName ?? null,
      })),
    })
  }
  return teams
}

/**
 * ESPN sync snapshot (raw jsonb: `{ league, members, rosters, matchups }`) →
 * one IntegrationTeam per `league.raw.teams[]` entry. Defensive throughout —
 * an ESPN payload that omits `teams` yields [] and the caller degrades to the
 * members-only view. Team display names come from the normalized `members[]`
 * rows (id ⇄ displayName); manager flags are read from the RAW member records
 * because the normalized rows drop them.
 */
export function espnTeamsFromSnapshot(raw: unknown): IntegrationTeam[] {
  const root = asRecord(raw)
  const league = asRecord(root?.league)
  if (!league) return []
  const payload = asRecord(league.raw) ?? league

  const rawTeams = asArray(payload.teams).map(asRecord).filter(Boolean) as NonNullable<
    ReturnType<typeof asRecord>
  >[]
  if (rawTeams.length === 0) return []

  const nameById = new Map<string, string>()
  for (const m of asArray(root?.members)) {
    const rec = asRecord(m)
    const id = typeof rec?.id === 'string' ? rec.id : null
    const name = typeof rec?.displayName === 'string' && rec.displayName.trim() !== '' ? rec.displayName : null
    if (id && name) nameById.set(id, name)
  }
  // Raw member records (fallback names + role flags), keyed by normalized id.
  const rawMemberRecords = new Map<string, Record<string, unknown>>()
  for (const m of asArray(payload.members)) {
    const rec = asRecord(m)
    const norm = normalizeESPNUserId(rec?.id)
    if (!rec || !norm) continue
    rawMemberRecords.set(norm, rec)
    if (!nameById.has(String(rec.id)) && isNonEmptyString(rec.displayName)) {
      nameById.set(String(rec.id), rec.displayName)
    }
  }

  const teams: IntegrationTeam[] = []
  for (const team of rawTeams) {
    const teamId = typeof team.id === 'number' || typeof team.id === 'string' ? String(team.id) : null
    if (!teamId) continue
    const owners = asArray(team.owners).filter(isNonEmptyString) as string[]
    const primary =
      isNonEmptyString(team.primaryOwner) ? team.primaryOwner! : owners.length > 0 ? owners[0] : null
    const coOwners = owners.filter((o) => o !== primary)
    const teamName = isNonEmptyString(team.name)
      ? team.name
      : isNonEmptyString(team.abbrev)
        ? team.abbrev
        : `Team ${teamId}`
    teams.push({
      provider: 'espn',
      externalId: teamId,
      teamName,
      ownerExternalId: primary,
      ownerDisplayName: primary ? nameById.get(primary) ?? null : null,
      platformRole: espnPlatformRoleFromRecord(
        primary ? rawMemberRecords.get(normalizeESPNUserId(primary) ?? '') ?? null : null,
      ),
      coOwners: coOwners.map((id) => ({ externalId: id, displayName: nameById.get(id) ?? null })),
    })
  }
  return teams
}

// ---------- matching (pure) ----------

export type ForcedLink = {
  /** IntegrationTeam.externalId */
  teamExternalId: string
  /** MatchableMember.id */
  memberId: string
}

/**
 * Assemble the Teams view rows from integration teams + our members.
 *
 * Passes, in priority order: forced id links (ESPN SWID metadata), unique
 * owner-display-name hits, unique member-`team_name` ⇄ integration team-name
 * hits. Leftovers become `unmatched_team` / `unmatched_member` rows.
 *
 * Output order: matched rows (by team name), then unclaimed teams (by team
 * name), then members without a team (input order).
 */
export function assembleTeamMatches(
  teams: IntegrationTeam[],
  members: MatchableMember[],
  forcedLinks: ForcedLink[] = [],
): TeamMatchResult[] {
  const results: TeamMatchResult[] = []
  const usedTeams = new Set<string>()
  const usedMembers = new Set<string>()

  // 1. Forced id links (declared metadata, not heuristics).
  const teamById = new Map(teams.map((t) => [t.externalId, t]))
  const memberById = new Map(members.map((m) => [m.id, m]))
  for (const link of forcedLinks) {
    if (usedTeams.has(link.teamExternalId) || usedMembers.has(link.memberId)) continue
    const team = teamById.get(link.teamExternalId)
    const member = memberById.get(link.memberId)
    if (!team || !member) continue
    usedTeams.add(team.externalId)
    usedMembers.add(member.id)
    results.push({ team, member, matchStatus: 'matched' })
  }

  // 2. Unique owner-display-name ⇄ member-display-name hits.
  const byNameKey = <T,>(items: T[], key: (item: T) => string | null): Map<string, T[]> => {
    const map = new Map<string, T[]>()
    for (const item of items) {
      const raw = key(item)
      const k = raw ? normalizeDisplayName(raw) : ''
      if (!k || k === 'unknown member') continue
      map.set(k, [...(map.get(k) ?? []), item])
    }
    return map
  }

  const openTeams = () => teams.filter((t) => !usedTeams.has(t.externalId))
  const openMembers = () => members.filter((m) => !usedMembers.has(m.id))

  const passOnce = (
    teamKeys: (t: IntegrationTeam) => string | null,
    memberKeys: (m: MatchableMember) => string | null,
  ) => {
    const teamsByKey = byNameKey(openTeams(), teamKeys)
    const membersByKey = byNameKey(openMembers(), memberKeys)
    for (const [key, teamCandidates] of teamsByKey) {
      const memberCandidates = membersByKey.get(key)
      if (!memberCandidates) continue
      // Unique on BOTH sides only — an ambiguous name stays unmatched.
      if (teamCandidates.length !== 1 || memberCandidates.length !== 1) continue
      const team = teamCandidates[0]
      const member = memberCandidates[0]
      if (usedTeams.has(team.externalId) || usedMembers.has(member.id)) continue
      usedTeams.add(team.externalId)
      usedMembers.add(member.id)
      results.push({ team, member, matchStatus: 'matched' })
    }
  }

  // A member's own display name under either of their identity fields; the
  // team side uses the integration owner display name.
  passOnce(
    (t) => t.ownerDisplayName,
    (m) => m.displayName,
  )
  // Our team_name vs the integration team label (last signal, still unique).
  passOnce(
    (t) => t.teamName,
    (m) => m.teamName,
  )

  // 3. Leftovers.
  const unmatchedTeams = openTeams().map((team) => ({
    team,
    member: null,
    matchStatus: 'unmatched_team' as TeamMatchStatus,
  }))
  const unmatchedMembers = openMembers().map((member) => ({
    team: null,
    member,
    matchStatus: 'unmatched_member' as TeamMatchStatus,
  }))

  const byTeamName = (a: TeamMatchResult, b: TeamMatchResult) =>
    (a.team?.teamName ?? '').localeCompare(b.team?.teamName ?? '', undefined, { sensitivity: 'base' })
  const matched = results.filter((r) => r.matchStatus === 'matched').sort(byTeamName)

  return [...matched, ...unmatchedTeams.sort(byTeamName), ...unmatchedMembers]
}

// ---------- composed read for the page ----------

/** Latest successful sync log snapshot for one connection, or null. */
async function fetchLatestSnapshot(connectionId: string): Promise<{ rawSnapshot: unknown; syncedAt: Date | null } | null> {
  const { data, error } = await db
    .from('integration_sync_log')
    .select('id, raw_snapshot, synced_at')
    .eq('connection_id', connectionId)
    .eq('status', 'success')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('team-matching sync-log query failed:', error)
    return null
  }
  if (!data) return null
  return {
    rawSnapshot: (data as { raw_snapshot?: unknown; synced_at?: string | null }).raw_snapshot,
    syncedAt: (data as { synced_at?: string | null }).synced_at ? new Date((data as { synced_at: string }).synced_at) : null,
  }
}

/**
 * member id ⇄ auth user id for the league's active rows. `listDirectoryMembers`
 * deliberately hides `user_id` behind its identity mapping, but the ESPN SWID
 * link needs it, so we read the raw column here (id + user_id only — no PII
 * beyond what the page already renders).
 */
async function fetchMemberUserIds(leagueId: string): Promise<Map<string, string>> {
  const { data, error } = await db
    .from('league_members')
    .select('id, user_id')
    .eq('league_id', leagueId)
    .eq('status', 'active')

  if (error) {
    console.error('team-matching league_members query failed:', error)
    return new Map()
  }
  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ id?: string; user_id?: string | null }>) {
    if (typeof row.id === 'string' && typeof row.user_id === 'string') map.set(row.id, row.user_id)
  }
  return map
}

/**
 * ESPN only: the connection row's stored SWID ⇄ created_by pair. Read
 * directly because `IntegrationConnectionView` intentionally drops cookie
 * columns; the SWID is used for one comparison inside this function and is
 * never returned, logged, or rendered.
 */
async function fetchESPNConnectionMetadata(
  connectionId: string,
): Promise<{ swid: string | null; createdBy: string | null } | null> {
  const { data, error } = await db
    .from('integration_connections')
    .select('id, swid, created_by')
    .eq('id', connectionId)
    .maybeSingle()
  if (error) {
    console.error('team-matching espn connection query failed:', error)
    return null
  }
  const row = asRecord(data)
  if (!row) return null
  return {
    swid: isNonEmptyString(row.swid) ? row.swid : null,
    createdBy: isNonEmptyString(row.created_by) ? row.created_by : null,
  }
}

/**
 * Everything the Teams view needs for one league, from stored data only.
 *
 * @param preloadedMembers optional already-loaded directory rows (the members
 *   page has them anyway); passing them avoids a second read + identity
 *   round-trip. When absent we load via `listDirectoryMembers` ourselves.
 *
 * Graceful-degradation contract (mirrors `getSleeperDisplayData`):
 *  - no active integration at all → provider null; every real member is an
 *    `unmatched_member` row with no team data (spec §3), so the view still
 *    renders a full roster;
 *  - active integration but no usable snapshot → provider set,
 *    `snapshotLoaded: false`, same member-only rows (the view shows a
 *    "sync once to populate teams" hint);
 *  - snapshot present → teams matched against members, leftovers surfaced.
 *
 * Never throws: a failing query degrades to the member-only picture.
 */
export async function buildTeamMatching(
  leagueId: string,
  preloadedMembers?: MemberRow[],
): Promise<TeamMatchingOutcome> {
  const membersResult: MatchableMember[] = []
  try {
    const members = preloadedMembers ?? (await listDirectoryMembers(leagueId))
    const userIdByMemberId = await fetchMemberUserIds(leagueId)
    for (const m of members) {
      // Reserved slots have no account to line up with — the members list
      // shows them; a Sleeper/ESPN owner cannot "match" a void.
      if (m.isPlaceholder === true) continue
      membersResult.push({
        id: m.id,
        userId: userIdByMemberId.get(m.id) ?? null,
        displayName: displayName(m),
        email: m.email,
        role: m.role,
        teamName: m.teamName,
      })
    }
  } catch (err) {
    console.error('buildTeamMatching member load failed:', err)
  }

  const fallback = (provider: string | null, snapshotLoaded: boolean, lastSyncedAt: Date | null): TeamMatchingOutcome => ({
    provider,
    snapshotLoaded,
    lastSyncedAt,
    results: membersResult.map((member) => ({ team: null, member, matchStatus: 'unmatched_member' as TeamMatchStatus })),
  })

  let connections
  try {
    connections = (await listLeagueConnections(leagueId)).filter((c) => c.status === 'active')
  } catch (err) {
    console.error('buildTeamMatching connection load failed:', err)
    return fallback(null, false, null)
  }
  if (connections.length === 0) return fallback(null, false, null)

  // Prefer the most recently synced integration (a league may hold a
  // disconnected older provider; only active rows reached here).
  const ordered = [...connections].sort(
    (a, b) => (b.lastSyncedAt?.getTime() ?? 0) - (a.lastSyncedAt?.getTime() ?? 0),
  )

  for (const connection of ordered) {
    const latest = await fetchLatestSnapshot(connection.id)
    if (!latest) continue

    let teams: IntegrationTeam[] = []
    let forced: ForcedLink[] = []

    if (connection.provider === 'sleeper') {
      const snapshot = parseSleeperSnapshot(latest.rawSnapshot)
      if (snapshot) teams = sleeperTeamsFromSnapshot(snapshot)
    } else if (connection.provider === 'espn') {
      teams = espnTeamsFromSnapshot(latest.rawSnapshot)
      // Spec'd link: a team whose primaryOwner is the connection's stored
      // SWID belongs to the account that connected the league.
      const meta = await fetchESPNConnectionMetadata(connection.id)
      const swidKey = normalizeESPNUserId(meta?.swid)
      if (swidKey && meta?.createdBy) {
        const ownerMember = membersResult.find((m) => m.userId === meta.createdBy)
        if (ownerMember) {
          for (const team of teams) {
            if (normalizeESPNUserId(team.ownerExternalId) === swidKey) {
              forced.push({ teamExternalId: team.externalId, memberId: ownerMember.id })
            }
          }
        }
      }
    }

    if (teams.length === 0) continue // unreadable snapshot — try the next connection

    const results = assembleTeamMatches(teams, membersResult, forced)
    return {
      provider: connection.provider,
      snapshotLoaded: true,
      lastSyncedAt: latest.syncedAt ?? connection.lastSyncedAt,
      results,
    }
  }

  // Active connection, but no successful parseable snapshot yet.
  return fallback(ordered[0].provider, false, ordered[0].lastSyncedAt ?? null)
}
