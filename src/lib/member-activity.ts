/**
 * Member profile → Activity read layer (t_ee39787e).
 *
 * Server-only — never import from a client component. Follows the same
 * layering as the other member-profile readers: reads go through the
 * service-role client in `src/lib/db.ts`, so every query carries an explicit
 * `league_id` filter (that IS the tenant-isolation gate) and the page gates
 * access with `loadLeagueContext` before calling this loader.
 *
 * Column names are the raw database names (`actor_id`, `created_at`); rows are
 * mapped to camelCase at this boundary.
 *
 * Everything is keyed on a `league_members.id`, which is stable across a
 * placeholder slot being claimed (the same row is flipped in place) or merged
 * (child records are re-parented), so a profile URL never re-resolves.
 */

import { db } from '@/src/lib/db'
import { fetchIdentities } from '@/src/lib/dashboard'
import { displayName } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import type { ActivityEventRow } from '@/src/db/rows'

/** Cap on the profile's activity strip — the newest slice only. */
export const MEMBER_ACTIVITY_LIMIT = 25

export type MemberActivityEventView = {
  id: string
  eventType: string
  description: string
  metadata: Record<string, unknown> | null
  createdAt: string
  /** Resolved actor display name, or 'System' for system-generated events. */
  actorName: string
  /** True when the member performed the event; false when it was done to them. */
  byMember: boolean
}

const SELECT =
  'id, league_id, actor_id, event_type, description, metadata, created_at'

/**
 * The member's auth id, or null for an unclaimed placeholder slot. Scoped to
 * the league so a foreign member id can never widen the actor query.
 */
async function resolveMemberUserId(
  leagueId: string,
  memberId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('id', memberId)
    .limit(1)

  if (error) {
    console.error('loadMemberActivity member lookup error:', error)
    return null
  }
  const row = (data ?? [])[0] as { user_id?: string | null } | undefined
  return row?.user_id ?? null
}

/**
 * Activity events that concern one member, newest first, actor names resolved.
 *
 * Two signals are merged, because the audit trail records both:
 *   * events the member THEMSELVES performed (`actor_id` = their auth user);
 *   * events ABOUT the member, keyed on `metadata.memberId` (e.g. an
 *     obligation created against them by the commissioner, or the member being
 *     removed from the league).
 *
 * An unclaimed placeholder slot has no auth id, so only the "about" signal
 * applies — its slot-created/merged events still surface.
 *
 * Known gap: a bulk obligation (`createBulkObligations`) stores `obligationIds`
 * and a `memberCount`, not per-member ids, so it does not appear on any one
 * member's profile. Single-member obligations and every actor event do.
 *
 * A query failure degrades to an empty list rather than blanking the page.
 */
export async function loadMemberActivity(
  leagueId: string,
  memberId: string,
): Promise<MemberActivityEventView[]> {
  if (!isUuid(leagueId) || !isUuid(memberId)) return []

  const userId = await resolveMemberUserId(leagueId, memberId)

  const [actorResult, aboutResult] = await Promise.all([
    userId
      ? db
          .from('activity_events')
          .select(SELECT)
          .eq('league_id', leagueId)
          .eq('actor_id', userId)
          .order('created_at', { ascending: false })
          .limit(MEMBER_ACTIVITY_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('activity_events')
      .select(SELECT)
      .eq('league_id', leagueId)
      .eq('metadata->>memberId', memberId)
      .order('created_at', { ascending: false })
      .limit(MEMBER_ACTIVITY_LIMIT),
  ])

  const rows: ActivityEventRow[] = []
  if (actorResult.error) console.error('loadMemberActivity actor error:', actorResult.error)
  else rows.push(...((actorResult.data ?? []) as unknown as ActivityEventRow[]))
  if (aboutResult.error) console.error('loadMemberActivity about error:', aboutResult.error)
  else rows.push(...((aboutResult.data ?? []) as unknown as ActivityEventRow[]))

  if (rows.length === 0) return []

  // Dedupe (an event can match both signals), newest first, capped.
  const byId = new Map<string, ActivityEventRow>()
  for (const row of rows) byId.set(row.id, row)
  const merged = Array.from(byId.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MEMBER_ACTIVITY_LIMIT)

  const identities = await fetchIdentities(
    merged.map((r) => r.actor_id).filter((id): id is string => id !== null),
  )

  return merged.map((row) => {
    const actor = row.actor_id ? identities.get(row.actor_id) : null
    return {
      id: row.id,
      eventType: row.event_type,
      description: row.description,
      metadata: (row.metadata ?? null) as Record<string, unknown> | null,
      createdAt: row.created_at,
      actorName: actor ? displayName(actor) : 'System',
      byMember: userId !== null && row.actor_id === userId,
    }
  })
}
