/**
 * Read queries backing the league dashboard, league settings and the
 * authenticated home (Phase 1 / T5).
 *
 * Server-only: imports the Drizzle pool. Everything here is a SELECT — writes
 * stay in app/actions/*.
 *
 * Access-control rule used by every league page (same semantics as the Phase 1
 * /T4 member directory): a league is visible to a viewer when they hold an
 * ACTIVE league_members row, or when they are the league's commissioner
 * (leagues.commissioner_id is the source of truth; the membership `role` is a
 * second, belt-and-braces signal for leagues whose row was backfilled).
 * Non-members get a 404, never a 403 — we do not confirm the league exists.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/src/lib/db'
import { leagues, leagueSeasons } from '@/src/db/schema/leagues'
import { leagueMembers } from '@/src/db/schema/members'
import { authUsers } from '@/src/db/schema/auth'

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

/**
 * One round trip: the league, its commissioner's email, and the viewer's
 * membership row. Returns null when the league does not exist OR is not
 * visible to this viewer — callers render notFound() for both so the two
 * cases are indistinguishable from outside.
 */
export async function loadLeagueContext(
  leagueId: string,
  userId: string,
): Promise<LeagueContext | null> {
  const [row] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      sport: leagues.sport,
      format: leagues.format,
      slug: leagues.slug,
      createdAt: leagues.createdAt,
      commissionerId: leagues.commissionerId,
      commissionerEmail: authUsers.email,
      viewerRole: leagueMembers.role,
      viewerStatus: leagueMembers.status,
    })
    .from(leagues)
    .leftJoin(authUsers, eq(authUsers.id, leagues.commissionerId))
    .leftJoin(
      leagueMembers,
      and(eq(leagueMembers.leagueId, leagues.id), eq(leagueMembers.userId, userId)),
    )
    .where(eq(leagues.id, leagueId))
    .limit(1)

  if (!row) return null

  const isCommissioner = row.commissionerId === userId || row.viewerRole === 'commissioner'
  const isMember = row.viewerStatus === 'active'

  if (!isCommissioner && !isMember) return null

  const { viewerStatus: _viewerStatus, ...rest } = row
  return { ...rest, isCommissioner, isMember }
}

/** Active membership rows only — 'removed'/'inactive' are excluded by design. */
export async function countActiveMembers(leagueId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leagueMembers)
    .where(
      and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.status, 'active')),
    )

  return row?.count ?? 0
}

/**
 * Active members, oldest member first (directory order, Phase 1 / T4).
 * `limit` caps the dashboard preview; the full directory passes none.
 */
export async function listActiveMembers(
  leagueId: string,
  limit?: number,
): Promise<MemberRow[]> {
  const query = db
    .select({
      id: leagueMembers.id,
      role: leagueMembers.role,
      teamName: leagueMembers.teamName,
      joinedAt: leagueMembers.joinedAt,
      email: authUsers.email,
      fullName: sql<string | null>`${authUsers.rawUserMetaData} ->> 'full_name'`,
      name: sql<string | null>`${authUsers.rawUserMetaData} ->> 'name'`,
      nickname: sql<string | null>`${authUsers.rawUserMetaData} ->> 'nickname'`,
    })
    .from(leagueMembers)
    .innerJoin(authUsers, eq(leagueMembers.userId, authUsers.id))
    .where(
      and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.status, 'active')),
    )
    .orderBy(asc(leagueMembers.joinedAt))

  return limit === undefined ? query : query.limit(limit)
}

/**
 * Current season for display. League creation seeds an is_current season row
 * (see createLeague), so new leagues resolve via the 'current' branch. The
 * fallbacks stay load-bearing for leagues created before the seed existed,
 * e.g. the ones already in the DB from the T2/T4 verification runs.
 */
export async function resolveSeason(leagueId: string): Promise<SeasonInfo> {
  const rows = await db
    .select({
      seasonYear: leagueSeasons.seasonYear,
      isCurrent: leagueSeasons.isCurrent,
    })
    .from(leagueSeasons)
    .where(eq(leagueSeasons.leagueId, leagueId))
    .orderBy(desc(leagueSeasons.seasonYear))

  const current = rows.find((r) => r.isCurrent === true)
  if (current) return { seasonYear: current.seasonYear, source: 'current' }
  if (rows.length > 0) return { seasonYear: rows[0].seasonYear, source: 'latest' }

  return { seasonYear: new Date().getUTCFullYear(), source: 'inferred' }
}

/**
 * The leagues this user belongs to, newest first — powers both /dashboard and
 * the nav's Members/Settings links.
 *
 * A league is included when the user has an ACTIVE membership row or owns it
 * via leagues.commissioner_id (same rule as loadLeagueContext). The
 * commissioner branch has a UNIQUE(league_id, user_id) membership row by
 * construction (createLeague writes it in one transaction), so it cannot
 * duplicate rows; the OR is there for leagues created before membership rows
 * existed.
 */
export async function listUserLeagues(userId: string): Promise<UserLeagueRow[]> {
  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      sport: leagues.sport,
      format: leagues.format,
      slug: leagues.slug,
      createdAt: leagues.createdAt,
      commissionerId: leagues.commissionerId,
      role: leagueMembers.role,
      status: leagueMembers.status,
      memberCount: sql<number>`(
        select count(*)::int from league_members lm_count
        where lm_count.league_id = leagues.id and lm_count.status = 'active'
      )`,
    })
    .from(leagues)
    .leftJoin(
      leagueMembers,
      and(eq(leagueMembers.leagueId, leagues.id), eq(leagueMembers.userId, userId)),
    )
    .orderBy(desc(leagues.createdAt))

  return rows
    .filter(
      (row) =>
        row.commissionerId === userId ||
        (row.status === 'active' && row.role !== null),
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      sport: row.sport,
      format: row.format,
      slug: row.slug,
      createdAt: row.createdAt,
      role: row.role,
      memberCount: row.memberCount,
      isCommissioner: row.commissionerId === userId || row.role === 'commissioner',
    }))
}

/**
 * First league for the viewer, used by the nav when the current URL is not a
 * league page (e.g. /dashboard) to still link to Members/Settings.
 */
export async function getPrimaryLeagueId(userId: string): Promise<string | null> {
  const [first] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .leftJoin(
      leagueMembers,
      and(eq(leagueMembers.leagueId, leagues.id), eq(leagueMembers.userId, userId)),
    )
    .where(
      sql`${leagues.commissionerId} = ${userId} OR ${leagueMembers.status} = 'active'`,
    )
    .orderBy(desc(leagues.createdAt))
    .limit(1)

  return first?.id ?? null
}
