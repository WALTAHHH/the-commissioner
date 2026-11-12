'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/src/lib/db'
import { leagues } from '@/src/db/schema/leagues'
import { leagueMembers } from '@/src/db/schema/members'
import { createClient } from '@/src/utils/supabase/server'

export interface RemoveMemberResult {
  error?: string
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Remove a member from a league (Phase 1 / T4).
 *
 * Sets league_members.status = 'removed' (soft removal — roster history is
 * preserved; the unique (league_id, user_id) index means re-joining later
 * flips the same row back to 'active').
 *
 * Authorization is enforced here, not by RLS: the server-action pool
 * connects as the table owner (postgres) which bypasses RLS. The
 * commissioner check is against leagues.commissioner_id, the source of
 * truth (membership `role` is display state and may lag custom-role work
 * in Phase 2).
 *
 * formData fields: leagueId, memberId (both uuid).
 */
export async function removeLeagueMember(
  formData: FormData,
): Promise<RemoveMemberResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const leagueId = formData.get('leagueId')
  const memberId = formData.get('memberId')
  if (
    typeof leagueId !== 'string' ||
    !UUID_REGEX.test(leagueId) ||
    typeof memberId !== 'string' ||
    !UUID_REGEX.test(memberId)
  ) {
    return { error: 'Invalid request.' }
  }

  // 1. Caller must be the league's commissioner.
  const [league] = await db
    .select({ commissionerId: leagues.commissionerId })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1)

  if (!league) {
    return { error: 'League not found.' }
  }
  if (league.commissionerId !== user.id) {
    return { error: 'Only the commissioner can remove members.' }
  }

  // 2. Target must be an active membership row of THIS league.
  const [target] = await db
    .select({
      role: leagueMembers.role,
      status: leagueMembers.status,
    })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.id, memberId),
        eq(leagueMembers.leagueId, leagueId),
      ),
    )
    .limit(1)

  if (!target) {
    return { error: 'Member not found in this league.' }
  }
  if (target.status !== 'active') {
    return { error: 'This member is not active.' }
  }
  if (target.role === 'commissioner') {
    return { error: 'The commissioner cannot be removed.' }
  }

  // 3. Soft-remove.
  await db
    .update(leagueMembers)
    .set({ status: 'removed' })
    .where(
      and(
        eq(leagueMembers.id, memberId),
        eq(leagueMembers.leagueId, leagueId),
      ),
    )

  revalidatePath(`/leagues/${leagueId}/members`)
  return {}
}
