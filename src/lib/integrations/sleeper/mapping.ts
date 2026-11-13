/**
 * Sleeper-3 display mapping.
 *
 * Reads synced Sleeper data from `integration_connections` +
 * `integration_sync_log.raw_snapshot` (written by sync.ts) — no new tables,
 * no live API calls on the render path. All helpers degrade to null/empty so
 * pages render normally when there is no Sleeper data.
 *
 * Mapping story: Sleeper `user_id` has no declared link to our
 * `league_members.user_id` (auth uuid) or emails, so matching is best-effort
 * by display name. A unique, confident hit maps the Sleeper data onto the
 * member row; anything ambiguous is surfaced as *unmatched* Sleeper teams
 * rather than hidden (spec: "show Sleeper data unmatched rather than hiding
 * it").
 */
import { db } from '@/src/lib/db'
import { getProviderConnection } from '@/src/lib/integrations/connections'
import type { SleeperLeague, SleeperMember, SleeperRoster } from './types'

export type SleeperSnapshot = {
  league: SleeperLeague
  members: SleeperMember[]
  rosters: SleeperRoster[]
}

export type SleeperLeagueSummary = {
  /** League name as it exists on Sleeper. */
  name: string
  /** Human-readable scoring format derived from scoring_settings. */
  scoringFormat: string
  /** Number of teams (rosters) on Sleeper. */
  teamCount: number
  /** Sleeper league status, e.g. 'upcoming' | 'playoffs'. */
  leagueStatus: string
  season: string
  /** From the connection row. */
  lastSyncedAt: Date | null
  externalLeagueId: string
  connectionId: string
}

/** Shape of one Sleeper roster's display info, resolved from the snapshot. */
export type SleeperTeamInfo = {
  /** Best-effort team label from roster data (metadata/settings/team name, fallback 'Team <roster id>'). */
  teamName: string
  rosterId: number
  /** Sleeper display name of the roster owner, when the owner is in the snapshot. */
  ownerDisplayName: string | null
  ownerUserId: string
}

export type MemberSleeperMatch = {
  teamName: string
  displayName: string
}

export type SleeperDisplayData = {
  summary: SleeperLeagueSummary
  /** member-id (our league_members.id) → Sleeper overlay for that row */
  matchByMemberId: Map<string, MemberSleeperMatch>
  /** Sleeper teams with no confident link to a league member */
  unmatchedTeams: SleeperTeamInfo[]
  /** true when mapping fell back to name heuristics and some hits stayed ambiguous */
  mappingAmbiguous: boolean
}

// ---------- snapshot reading ----------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/**
 * Parse the jsonb `raw_snapshot` written by sync.ts
 * (`{ league, members, rosters }` of normalized types) defensively — a
 * malformed or partial snapshot yields null, never a throw at render time.
 */
export function parseSleeperSnapshot(raw: unknown): SleeperSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>

  const league = s.league as Record<string, unknown> | undefined
  if (!league || typeof league !== 'object' || !isNonEmptyString(league.name)) {
    return null
  }

  const members = Array.isArray(s.members)
    ? (s.members as unknown[]).filter(
        (m): m is SleeperMember =>
          !!m &&
          typeof m === 'object' &&
          isNonEmptyString((m as Record<string, unknown>).externalId),
      )
    : []

  const rosters = Array.isArray(s.rosters)
    ? (s.rosters as unknown[]).filter(
        (r): r is SleeperRoster =>
          !!r &&
          typeof r === 'object' &&
          typeof (r as Record<string, unknown>).externalId === 'number' &&
          isNonEmptyString((r as Record<string, unknown>).ownerExternalId),
      )
    : []

  return { league: league as unknown as SleeperLeague, members, rosters }
}

export function describeScoringFormat(league: SleeperLeague): string {
  // Prefer an explicit type in league settings if Sleeper ships one.
  const settings = (league.settings ?? {}) as Record<string, unknown>
  const explicit = settings.scoring_type ?? settings.scoringFormat
  if (isNonEmptyString(explicit)) return explicit
  // Otherwise: populated scoring_settings map = custom/manual scoring,
  // empty map = Sleeper's league-wide default (best available signal).
  const scoring = (league.scoringSettings ?? {}) as Record<string, unknown>
  const ruleCount = Object.keys(scoring).length
  if (ruleCount > 0) return `Custom scoring (${ruleCount} rules)`
  return 'Default scoring'
}

/** Sleeper sport codes ('nfl' | 'nba' | ...) → our SPORT_OPTIONS values. */
export function mapSleeperSport(sport: string): string {
  const map: Record<string, string> = {
    nfl: 'football',
    nba: 'basketball',
    mlb: 'baseball',
    nhl: 'hockey',
  }
  return map[sport.toLowerCase()] ?? 'football'
}

/**
 * Sleeper league settings → our FORMAT_OPTIONS value plus a display label.
 * Sleeper encodes league style in `settings.league_sub_type` / `league_type`
 * (live values: 'yearly', 'dynamic', 'harddrop', 'salary', 'bestball').
 */
export function mapSleeperFormat(settings: Record<string, unknown>): { value: string; label: string } {
  const subType = typeof settings?.league_sub_type === 'string' ? settings.league_sub_type.toLowerCase() : ''
  const type = typeof settings?.league_type === 'string' ? settings.league_type.toLowerCase() : ''
  if (subType === 'dynamic' || type.includes('dynasty')) return { value: 'dynasty', label: 'Dynasty' }
  if (subType === 'harddrop' || type.includes('keeper')) return { value: 'keeper', label: 'Keeper' }
  if (subType === 'salary' || type.includes('auction')) return { value: 'auction', label: 'Auction' }
  if (subType.includes('bestball') || type.includes('bestball')) return { value: 'best-ball', label: 'Best Ball' }
  // Sleeper's seasonal league ('yearly' / anything unrecognized) is a redraft.
  return { value: 'redraft', label: 'Redraft' }
}

/**
 * Human-readable scoring descriptor from Sleeper settings, e.g. 'PPR',
 * 'Half-PPR', '3-QB (Dynamic Scoring)'. Falls back to describeScoringFormat.
 */
export function sleeperScoringDescriptor(league: SleeperLeague): string {
  const settings = (league.settings ?? {}) as Record<string, unknown>
  const scoringType = typeof settings.scoring_type === 'string' ? settings.scoring_type : ''
  const labels: Record<string, string> = {
    ppr: 'PPR',
    '2ppr': '2×PPR',
    half_ppr: 'Half-PPR',
    tpr: 'TPR',
    default: 'No PPR',
  }
  if (labels[scoringType]) return labels[scoringType]
  return describeScoringFormat(league)
}

/**
 * Load the synced Sleeper data for a league, or null when there is no active
 * Sleeper connection or no successful snapshot yet. Never throws.
 */
export async function getSyncedSleeperSnapshot(
  leagueId: string,
): Promise<{ connectionId: string; externalLeagueId: string; lastSyncedAt: Date | null; snapshot: SleeperSnapshot } | null> {
  try {
    const connection = await getProviderConnection(leagueId, 'sleeper')
    if (!connection || connection.status !== 'active') return null

    const { data: log, error } = await db
      .from('integration_sync_log')
      .select('id, raw_snapshot')
      .eq('connection_id', connection.id)
      .eq('status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('getSyncedSleeperSnapshot sync-log query failed:', error)
      return null
    }
    if (!log) return null

    const snapshot = parseSleeperSnapshot(log.raw_snapshot)
    if (!snapshot) return null

    return {
      connectionId: connection.id,
      externalLeagueId: connection.externalLeagueId,
      lastSyncedAt: connection.lastSyncedAt,
      snapshot,
    }
  } catch (err) {
    console.error('getSyncedSleeperSnapshot unexpected error:', err)
    return null
  }
}

// ---------- roster / team helpers ----------

/**
 * Best-effort Sleeper team label from roster data. Sleeper rosters carry no
 * guaranteed team name, so we probe metadata/settings and fall back to the
 * roster id (still real Sleeper data, never invented).
 */
export function sleeperTeamName(roster: SleeperRoster): string {
  const candidates: unknown[] = [
    (roster.metadata as Record<string, unknown> | null)?.team_name,
    (roster.settings as Record<string, unknown> | null)?.team_name,
    (roster.raw?.metadata as Record<string, unknown> | null)?.team_name,
  ]
  for (const c of candidates) {
    if (isNonEmptyString(c)) return c
  }
  return `Team ${roster.externalId}`
}

export function rosterInfoByOwner(snapshot: SleeperSnapshot): Map<string, SleeperTeamInfo> {
  const byOwner = new Map<string, SleeperTeamInfo>()
  const displayNameByUser = new Map<string, string>()
  for (const m of snapshot.members) displayNameByUser.set(m.externalId, m.displayName)
  for (const r of snapshot.rosters) {
    byOwner.set(r.ownerExternalId, {
      teamName: sleeperTeamName(r),
      rosterId: r.externalId,
      ownerDisplayName: displayNameByUser.get(r.ownerExternalId) ?? null,
      ownerUserId: r.ownerExternalId,
    })
  }
  return byOwner
}

// ---------- member matching (best effort) ----------

/** Normalize a display name for comparison: casefold, trim, collapse spaces. */
export function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Map Sleeper user data onto our league members.
 *
 * @param leagueMembers our members, only `id` + the already-resolved display
 *   name are needed (pages pass `displayName(m)`).
 *
 * A Sleeper team maps to exactly one member when the owner display name is a
 * unique match against the member list. Members whose name matches multiple
 * Sleeper owners (or zero) are left unmatched and surfaced via
 * `unmatchedTeams` instead of being dropped.
 */
export function mapSleeperUsersToMembers(
  snapshot: SleeperSnapshot,
  leagueMembers: Array<{ id: string; displayName: string }>,
): {
  matchByMemberId: Map<string, MemberSleeperMatch>
  unmatchedTeams: SleeperTeamInfo[]
  ambiguous: boolean
} {
  const matchByMemberId = new Map<string, MemberSleeperMatch>()
  const matchedOwnerIds = new Set<string>()
  const ownerInfo = rosterInfoByOwner(snapshot)

  // Index our members by normalized display name; track duplicates → ambiguous.
  const nameCounts = new Map<string, number>()
  for (const lm of leagueMembers) {
    const key = normalizeDisplayName(lm.displayName)
    if (!key) continue
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }

  let ambiguous = false

  // Index Sleeper owners by normalized display name (prefer roster owner display
  // name; fall back to the member display name if a user has no roster).
  const sleeperNames = new Map<string, string[]>() // normalized name -> sleeper user ids
  for (const [ownerId, info] of ownerInfo) {
    const name = info.ownerDisplayName
    if (!name) continue
    const key = normalizeDisplayName(name)
    sleeperNames.set(key, [...(sleeperNames.get(key) ?? []), ownerId])
  }
  for (const m of snapshot.members) {
    if (ownerInfo.has(m.externalId)) continue // roster owners already indexed
    const key = normalizeDisplayName(m.displayName)
    sleeperNames.set(key, [...(sleeperNames.get(key) ?? []), m.externalId])
  }

  const usedSleeperUsers = new Set<string>()

  for (const lm of leagueMembers) {
    const key = normalizeDisplayName(lm.displayName)
    if (!key) continue
    const candidateIds = sleeperNames.get(key)
    if (!candidateIds || candidateIds.length === 0) continue

    if ((nameCounts.get(key) ?? 0) > 1 || candidateIds.length > 1) {
      // Our member name matches several Sleeper users (or our list itself has
      // duplicate names) — no confident 1:1 mapping. Mark ambiguous, leave row
      // clean; the Sleeper team still shows in the unmatched list.
      ambiguous = true
      continue
    }
    if (usedSleeperUsers.has(candidateIds[0])) {
      ambiguous = true
      continue
    }

    const sleeperUserId = candidateIds[0]
    usedSleeperUsers.add(sleeperUserId)
    matchedOwnerIds.add(sleeperUserId)

    const member = snapshot.members.find((m) => m.externalId === sleeperUserId)
    const info = ownerInfo.get(sleeperUserId)
    if (!member && !info) continue

    matchByMemberId.set(lm.id, {
      teamName: info?.teamName ?? `Team ${sleeperUserId}`,
      displayName: member?.displayName ?? info?.ownerDisplayName ?? sleeperUserId,
    })
  }

  const unmatchedTeams: SleeperTeamInfo[] = []
  for (const [ownerId, info] of ownerInfo) {
    if (!matchedOwnerIds.has(ownerId)) unmatchedTeams.push(info)
  }

  return { matchByMemberId, unmatchedTeams, ambiguous }
}

// ---------- composed read for pages ----------

/**
 * Everything the dashboard/members pages need from synced Sleeper data in one
 * call. Returns null when there is no connected+synced Sleeper integration, so
 * callers render unchanged (graceful degradation).
 */
export async function getSleeperDisplayData(
  leagueId: string,
  ourMembers: Array<{ id: string; displayName: string }> = [],
): Promise<SleeperDisplayData | null> {
  const synced = await getSyncedSleeperSnapshot(leagueId)
  if (!synced) return null

  const { league, rosters } = synced.snapshot

  const summary: SleeperLeagueSummary = {
    name: league.name,
    scoringFormat: describeScoringFormat(league),
    teamCount: rosters.length,
    leagueStatus: league.status,
    season: league.season,
    lastSyncedAt: synced.lastSyncedAt,
    externalLeagueId: synced.externalLeagueId,
    connectionId: synced.connectionId,
  }

  const { matchByMemberId, unmatchedTeams, ambiguous } = mapSleeperUsersToMembers(
    synced.snapshot,
    ourMembers,
  )

  return { summary, matchByMemberId, unmatchedTeams, mappingAmbiguous: ambiguous }
}
