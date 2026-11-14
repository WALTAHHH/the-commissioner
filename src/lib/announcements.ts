/**
 * Announcement read layer (Announcements-2).
 *
 * Server-only — never import from a client component. Same architecture as
 * `src/lib/governance.ts` / `src/lib/rules.ts`: reads go through the
 * service-role client in `src/lib/db.ts` and page access is gated by
 * `loadLeagueContext` in the page, because the `authorize()` stub still
 * denies every action-layer call. The action layer (`app/actions/
 * announcements.ts`) re-checks `leagues.commissioner_id` before any write —
 * the same functional pattern invitations and integrations use.
 *
 * Column names are the raw database names (`league_id`, `is_pinned`) —
 * PostgREST has no ORM translation. Row shapes live in `src/db/rows.ts` and
 * everything is mapped to camelCase at this boundary.
 *
 * Soft-deleted announcements (`deleted_at IS NOT NULL`) are filtered out of
 * every read here, exactly like `src/lib/rules.ts` treats deleted rules.
 */

import { db } from '@/src/lib/db'
import { fetchIdentities } from '@/src/lib/dashboard'
import { displayName } from '@/src/lib/display'
import type {
  AnnouncementReadRow,
  AnnouncementRow,
  LeagueMemberRow,
} from '@/src/db/rows'

export type AnnouncementView = {
  id: string
  leagueId: string
  createdBy: string
  /** Rendered author name (full name → email fallback), never blank. */
  authorName: string
  title: string
  body: string
  isPinned: boolean
  /** Whether the viewer already recorded a read for this announcement. */
  isRead: boolean
  createdAt: string
  updatedAt: string
}

const ANNOUNCEMENT_COLUMNS =
  'id, league_id, created_by, title, body, is_pinned, created_at, updated_at, deleted_at'

/**
 * The viewer's ACTIVE membership row id, or null. `announcement_reads`
 * references league_members.id (same convention as poll_votes.member_id),
 * so every per-member read computation needs this first.
 */
export async function loadActiveMemberId(
  leagueId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.error('loadActiveMemberId error:', error)
    return null
  }
  return data ? (data as unknown as { id: string }).id : null
}

/**
 * All non-deleted announcements for a league, pinned first then newest
 * first, with `isRead` computed for one viewer. A viewer with no active
 * membership (e.g. edge cases around removed members) sees everything as
 * unread rather than erroring — the page gate is loadLeagueContext's job.
 */
export async function loadAnnouncements(
  leagueId: string,
  userId: string,
): Promise<AnnouncementView[]> {
  const { data: rowsData, error: rowsError } = await db
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('league_id', leagueId)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (rowsError) {
    console.error('loadAnnouncements query error:', rowsError)
    return []
  }

  const rows = (rowsData ?? []) as unknown as AnnouncementRow[]
  if (rows.length === 0) return []

  // Read state is a single batched lookup, never N queries.
  const memberId = await loadActiveMemberId(leagueId, userId)
  const readIds = new Set<string>()
  if (memberId) {
    const { data: readsData, error: readsError } = await db
      .from('announcement_reads')
      .select('announcement_id')
      .eq('member_id', memberId)
      .in(
        'announcement_id',
        rows.map((r) => r.id),
      )

    if (readsError) {
      console.error('loadAnnouncements reads error:', readsError)
    } else {
      for (const row of (readsData ?? []) as unknown as Pick<
        AnnouncementReadRow,
        'announcement_id'
      >[]) {
        readIds.add(row.announcement_id)
      }
    }
  }

  const authorIds = Array.from(new Set(rows.map((r) => r.created_by)))
  const identities = await fetchIdentities(authorIds)

  return rows.map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    createdBy: row.created_by,
    authorName: displayName(
      identities.get(row.created_by) ?? {
        email: null,
        fullName: null,
        name: null,
        nickname: null,
      },
    ),
    title: row.title,
    body: row.body,
    isPinned: row.is_pinned,
    isRead: readIds.has(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/**
 * Hard ceiling on rows the cross-league fetch pulls per page render. Every
 * row is shown read or unread (read state only badges an item), so the
 * window simply bounds the newest-N scan: 100 is far above any widget
 * `limit`, and it caps the payload instead of PostgREST's implicit 1000-row
 * default.
 */
const CROSS_LEAGUE_FETCH_WINDOW = 100

/** How many announcements the dashboard widget shows by default. */
export const DASHBOARD_ANNOUNCEMENT_LIMIT = 5

/** Cross-league announcement plus the league it came from, for the dashboard widget. */
export type AnnouncementCrossLeagueView = AnnouncementView & {
  leagueName: string
  leagueSlug: string
}

/**
 * Recent announcements across every league the user belongs to — the read
 * behind the /dashboard "Recent announcements" widget.
 *
 * Access rule is identical to the per-league pages: the candidate league set
 * is exactly what `listUserLeagues` returns (active membership row OR
 * commissioner ownership), and the query filters announcements by
 * `league_id`, so a league the viewer cannot see contributes nothing.
 * Service-role RLS
 * bypass makes this the only gate, same as every other read in this layer.
 *
 * Read state spans leagues via the viewer's membership row PER LEAGUE
 * (`announcement_reads.member_id` references `league_members.id`), so a read
 * recorded in one league can never mark an announcement in another.
 *
 * Ordering is strictly newest-first across leagues (unlike the per-league
 * list, where pinned floats to the top): the widget is a "what just
 * happened" feed, and pinned items keep their Pinned badge as they age.
 *
 * `leagues` is injected (rather than re-fetched) because /dashboard already
 * has the viewer's league list; passing it avoids a duplicate query and
 * guarantees the widget and the league grid agree on what is visible.
 */
export async function loadRecentAnnouncementsAcrossLeagues(
  userId: string,
  leagues: { id: string; name: string; slug: string }[],
  limit: number = DASHBOARD_ANNOUNCEMENT_LIMIT,
): Promise<AnnouncementCrossLeagueView[]> {
  if (leagues.length === 0 || limit <= 0) return []

  const leagueById = new Map(leagues.map((l) => [l.id, l]))

  const { data: rowsData, error: rowsError } = await db
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .in('league_id', Array.from(leagueById.keys()))
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(CROSS_LEAGUE_FETCH_WINDOW)

  if (rowsError) {
    console.error('loadRecentAnnouncementsAcrossLeagues query error:', rowsError)
    return []
  }

  const rows = (rowsData ?? []) as unknown as AnnouncementRow[]
  if (rows.length === 0) return []

  // The viewer's active membership id per league — the join key for reads.
  const { data: membershipData, error: membershipError } = await db
    .from('league_members')
    .select('id, league_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('league_id', Array.from(leagueById.keys()))

  if (membershipError) {
    console.error('loadRecentAnnouncementsAcrossLeagues membership error:', membershipError)
  }

  const memberships = (membershipData ?? []) as unknown as Pick<
    LeagueMemberRow,
    'id' | 'league_id'
  >[]
  // Read attribution runs member → league: a read row is only honoured for
  // the announcement in the league that owns the membership it was recorded
  // through, so a stray/legacy read can never mark an item in another league.
  const leagueIdByMemberId = new Map(
    memberships.map((m) => [m.id, m.league_id]),
  )
  const memberIds = memberships.map((m) => m.id)

  // One batched reads lookup for all of the viewer's memberships; each read
  // row is attributed back to its league via the member→league map.
  const readKeys = new Set<string>()
  if (memberIds.length > 0) {
    const { data: readsData, error: readsError } = await db
      .from('announcement_reads')
      .select('announcement_id, member_id')
      .in('member_id', memberIds)

    if (readsError) {
      console.error('loadRecentAnnouncementsAcrossLeagues reads error:', readsError)
    } else {
      for (const row of (readsData ?? []) as unknown as Pick<
        AnnouncementReadRow,
        'announcement_id' | 'member_id'
      >[]) {
        const leagueId = leagueIdByMemberId.get(row.member_id)
        if (leagueId) readKeys.add(`${row.announcement_id}:${leagueId}`)
      }
    }
  }

  const identities = await fetchIdentities(
    Array.from(new Set(rows.map((r) => r.created_by))),
  )

  const views: AnnouncementCrossLeagueView[] = []
  for (const row of rows) {
    if (views.length >= limit) break
    const league = leagueById.get(row.league_id)
    if (!league) continue // defensive: .in() guarantees this, keep the map total
    views.push({
      id: row.id,
      leagueId: row.league_id,
      leagueName: league.name,
      leagueSlug: league.slug,
      createdBy: row.created_by,
      authorName: displayName(
        identities.get(row.created_by) ?? {
          email: null,
          fullName: null,
          name: null,
          nickname: null,
        },
      ),
      title: row.title,
      body: row.body,
      isPinned: row.is_pinned,
      isRead: readKeys.has(`${row.id}:${row.league_id}`),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }
  return views
}
