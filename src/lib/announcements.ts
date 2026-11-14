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
