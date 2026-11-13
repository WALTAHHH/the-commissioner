/**
 * Read queries backing the league dashboard, league settings and the
 * authenticated home (Phase 1 / T5).
 *
 * Server-only. Everything here is a read — writes live in app/actions/*.
 * Queries go over HTTPS to PostgREST via the service-role client in
 * `src/lib/db.ts`, so column names are the raw DB names (`league_id`, not
 * `leagueId`) and results are mapped to camelCase types at the boundary — the
 * exported shapes below are the page contract and did not change.
 *
 * Identity fields (email, display name) come from `auth.users`, which
 * PostgREST does not expose (`PGRST205: Could not find the table
 * 'public.auth.users'`) — even for the service role. They are read through
 * GoTrue's admin API instead, one HTTPS call per user, in parallel and with
 * failures degraded to `null` rather than a broken page.
 *
 * Access-control rule used by every league page (same semantics as the Phase 1
 * /T4 member directory): a league is visible to a viewer when they hold an
 * ACTIVE league_members row, or when they are the league's commissioner
 * (leagues.commissioner_id is the source of truth; the membership `role` is a
 * second, belt-and-braces signal for leagues whose row was backfilled).
 * Non-members get a 404, never a 403 — we do not confirm the league exists.
 * The service-role key bypasses RLS, so this check is the only gate.
 */

import { db } from '@/src/lib/db'
import type {
  LeagueMemberRow,
  LeagueRow,
  LeagueSeasonRow,
  UserIdentityRow,
} from '@/src/db/rows'

/** How many members the dashboard previews before "View all members". */
export const MEMBER_PREVIEW_LIMIT = 6

export type LeagueContext = {
  id: string
  name: string
  sport: string
  format: string
  slug: string
  createdAt: Date
  commissionerId: string
  commissionerEmail: string | null
  /** The viewer's membership role, or null when they are not a member. */
  viewerRole: string | null
  isCommissioner: boolean
  /** Visible to this viewer? (active member or commissioner) */
  isMember: boolean
}

export type MemberRow = {
  id: string
  role: string
  teamName: string | null
  joinedAt: Date
  email: string | null
  fullName: string | null
  name: string | null
  nickname: string | null
}

export type SeasonSource = 'current' | 'latest' | 'inferred'

export type SeasonInfo = {
  seasonYear: number
  /**
   * 'current'  — a league_seasons row flagged is_current
   * 'latest'  — rows exist but none is flagged; newest season_year wins
   * 'inferred' — the league has no season rows at all (league creation does
   *              not seed one yet), so we show the current calendar year and
   *              say so rather than leaving the field blank.
   */
  source: SeasonSource
}

export type UserLeagueRow = {
  id: string
  name: string
  sport: string
  format: string
  slug: string
  createdAt: Date
  role: string | null
  isCommissioner: boolean
  memberCount: number
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Metadata strings are user-supplied and optional; anything else is ignored. */
function metaString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Display identity for a set of auth user ids, via GoTrue's admin API.
 *
 * Batched into parallel single lookups because PostgREST cannot read the auth
 * schema and GoTrue has no "get these N users" endpoint. One call per user is
 * the known cost of that (fine at league-member scale, i.e. dozens; a league of
 * thousands of members would want a public-side profile table instead, which is
 * what the unused `public.users` mirror was for).
 *
 * Never throws: an unreachable or deleted user simply is absent from the map,
 * and callers fall back to 'Unknown member' (see src/lib/display.ts).
 *
 * Exported for `src/lib/activity.ts`, which resolves activity-feed actor
 * names through the same single lookup path rather than duplicating it.
 */
export async function fetchIdentities(
  userIds: readonly string[],
): Promise<Map<string, UserIdentityRow>> {
  const unique = Array.from(
    new Set(userIds.filter((id) => typeof id === 'string' && UUID_REGEX.test(id))),
  )

  const results = await Promise.all(
    unique.map(async (id): Promise<UserIdentityRow | null> => {
      try {
        const { data, error } = await db.auth.admin.getUserById(id)
        if (error || !data?.user) return null
        const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>
        return {
          id,
          email: data.user.email ?? null,
          fullName: metaString(metadata.full_name),
          name: metaString(metadata.name),
          nickname: metaString(metadata.nickname),
        }
      } catch {
        return null
      }
    }),
  )

  return new Map(results.filter((row): row is UserIdentityRow => row !== null).map((r) => [r.id, r]))
}

/**
 * The league, its commissioner's email, and the viewer's membership row.
 * Returns null when the league does not exist OR is not visible to this
 * viewer — callers render notFound() for both so the two cases are
 * indistinguishable from outside.
 */
export async function loadLeagueContext(
  leagueId: string,
  userId: string,
): Promise<LeagueContext | null> {
  const { data: leagueData, error: leagueError } = await db
    .from('leagues')
    .select('id, name, sport, format, slug, commissioner_id, created_at')
    .eq('id', leagueId)
    .maybeSingle()

  if (leagueError) {
    console.error('loadLeagueContext league error:', leagueError)
  }
  if (!leagueData) {
    return null
  }
  const league = leagueData as unknown as LeagueRow

  // The viewer's membership row, then the commissioner's identity. The second
  // lookup is only needed for a viewer who passed the gate, so it runs last.
  const { data: membershipData, error: membershipError } = await db
    .from('league_members')
    .select('role, status')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipError) {
    console.error('loadLeagueContext membership error:', membershipError)
  }

  const membership = membershipData as
    | { role: string; status: string }
    | null
    | undefined

  const isCommissioner =
    league.commissioner_id === userId || membership?.role === 'commissioner'
  const isMember = membership?.status === 'active'

  if (!isCommissioner && !isMember) return null

  const identities = await fetchIdentities([league.commissioner_id])

  return {
    id: league.id,
    name: league.name,
    sport: league.sport,
    format: league.format,
    slug: league.slug,
    createdAt: new Date(league.created_at),
    commissionerId: league.commissioner_id,
    commissionerEmail: identities.get(league.commissioner_id)?.email ?? null,
    viewerRole: membership?.role ?? null,
    isCommissioner,
    isMember,
  }
}

/** Active membership rows only — 'removed'/'inactive' are excluded by design. */
export async function countActiveMembers(leagueId: string): Promise<number> {
  const { count, error } = await db
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .eq('status', 'active')

  if (error) {
    console.error('countActiveMembers error:', error)
    return 0
  }
  return count ?? 0
}

/**
 * Active members, oldest member first (directory order, Phase 1 / T4).
 * `limit` caps the dashboard preview; the full directory passes none.
 */
export async function listActiveMembers(
  leagueId: string,
  limit?: number,
): Promise<MemberRow[]> {
  let membersQuery = db
    .from('league_members')
    .select('id, role, team_name, joined_at, user_id')
    .eq('league_id', leagueId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  if (limit !== undefined) {
    membersQuery = membersQuery.limit(limit)
  }

  const { data: membersData, error: membersError } = await membersQuery

  if (membersError) {
    console.error('listActiveMembers error:', membersError)
    return []
  }

  const members = (membersData ?? []) as unknown as Pick<
    LeagueMemberRow,
    'id' | 'role' | 'team_name' | 'joined_at' | 'user_id'
  >[]

  const identities = await fetchIdentities(members.map((m) => m.user_id))

  return members.map((member) => {
    const user = identities.get(member.user_id)
    return {
      id: member.id,
      role: member.role,
      teamName: member.team_name,
      joinedAt: new Date(member.joined_at),
      email: user?.email ?? null,
      fullName: user?.fullName ?? null,
      name: user?.name ?? null,
      nickname: user?.nickname ?? null,
    }
  })
}

/**
 * Current season for display. League creation seeds an is_current season row
 * (see createLeague), so new leagues resolve via the 'current' branch. The
 * fallbacks stay load-bearing for leagues created before the seed existed,
 * e.g. the ones already in the DB from the T2/T4 verification runs.
 */
export async function resolveSeason(leagueId: string): Promise<SeasonInfo> {
  const { data, error } = await db
    .from('league_seasons')
    .select('season_year, is_current')
    .eq('league_id', leagueId)
    .order('season_year', { ascending: false })

  if (error) {
    console.error('resolveSeason error:', error)
    return { seasonYear: new Date().getUTCFullYear(), source: 'inferred' }
  }

  const rows = (data ?? []) as unknown as Pick<
    LeagueSeasonRow,
    'season_year' | 'is_current'
  >[]

  const current = rows.find((row) => row.is_current === true)
  if (current) return { seasonYear: current.season_year, source: 'current' }
  if (rows.length > 0) return { seasonYear: rows[0].season_year, source: 'latest' }

  return { seasonYear: new Date().getUTCFullYear(), source: 'inferred' }
}

/**
 * The leagues this user belongs to, newest first — powers both /dashboard and
 * the nav's Members/Settings links.
 *
 * A league is included when the user has an ACTIVE membership row or owns it
 * via leagues.commissioner_id (same rule as loadLeagueContext). The
 * commissioner branch has a UNIQUE(league_id, user_id) membership row by
 * construction (createLeague writes it), so it cannot duplicate rows; the OR is
 * there for leagues created before membership rows existed.
 */
export async function listUserLeagues(userId: string): Promise<UserLeagueRow[]> {
  const [{ data: ownedData, error: ownedError }, { data: memberData, error: memberError }] =
    await Promise.all([
      db
        .from('leagues')
        .select('id')
        .eq('commissioner_id', userId),
      db
        .from('league_members')
        .select('league_id, role')
        .eq('user_id', userId)
        .eq('status', 'active'),
    ])

  if (ownedError) console.error('listUserLeagues owned error:', ownedError)
  if (memberError) console.error('listUserLeagues membership error:', memberError)

  const ownedIds = new Set(
    ((ownedData ?? []) as unknown as Pick<LeagueRow, 'id'>[]).map((l) => l.id),
  )
  const roleByLeagueId = new Map<string, string>(
    ((memberData ?? []) as unknown as Pick<LeagueMemberRow, 'league_id' | 'role'>[]).map(
      (m) => [m.league_id, m.role],
    ),
  )

  const leagueIds = Array.from(new Set([...ownedIds, ...roleByLeagueId.keys()]))
  if (leagueIds.length === 0) return []

  const { data: leaguesData, error: leaguesError } = await db
    .from('leagues')
    .select('id, name, sport, format, slug, commissioner_id, created_at')
    .in('id', leagueIds)
    .order('created_at', { ascending: false })

  if (leaguesError || !leaguesData) {
    console.error('listUserLeagues leagues error:', leaguesError)
    return []
  }

  const leagues = leaguesData as unknown as LeagueRow[]

  // Member counts per league. One COUNT query each, in parallel, rather than
  // pulling every membership row into memory: PostgREST caps a request at 1000
  // rows by default, which would silently truncate a grouped count on a
  // multi-league roster set.
  const counts = await Promise.all(
    leagues.map(async (league) => {
      const { count } = await db
        .from('league_members')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', league.id)
        .eq('status', 'active')
      return [league.id, count ?? 0] as const
    }),
  )
  const memberCountByLeagueId = new Map(counts)

  return leagues.map((league) => {
    const role = roleByLeagueId.get(league.id) ?? null
    return {
      id: league.id,
      name: league.name,
      sport: league.sport,
      format: league.format,
      slug: league.slug,
      createdAt: new Date(league.created_at),
      role,
      memberCount: memberCountByLeagueId.get(league.id) ?? 0,
      isCommissioner:
        league.commissioner_id === userId || role === 'commissioner',
    }
  })
}

/**
 * First league for the viewer, used by the nav when the current URL is not a
 * league page (e.g. /dashboard) to still link to Members/Settings.
 */
export async function getPrimaryLeagueId(userId: string): Promise<string | null> {
  const [{ data: ownedData }, { data: memberData }] = await Promise.all([
    db.from('leagues').select('id').eq('commissioner_id', userId),
    db
      .from('league_members')
      .select('league_id')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ])

  const ids = new Set<string>()
  for (const row of (ownedData ?? []) as unknown as Pick<LeagueRow, 'id'>[]) {
    ids.add(row.id)
  }
  for (const row of (memberData ?? []) as unknown as Pick<LeagueMemberRow, 'league_id'>[]) {
    ids.add(row.league_id)
  }

  if (ids.size === 0) return null

  // Newest first. Done as a plain `leagues` query because ordering on an
  // embedded resource (`order=leagues.created_at.desc`) is rejected by this
  // PostgREST build with PGRST100.
  const { data: newestData, error: newestError } = await db
    .from('leagues')
    .select('id')
    .in('id', Array.from(ids))
    .order('created_at', { ascending: false })
    .limit(1)

  if (newestError) {
    console.error('getPrimaryLeagueId error:', newestError)
    return null
  }

  return ((newestData ?? []) as unknown as Pick<LeagueRow, 'id'>[])[0]?.id ?? null
}
