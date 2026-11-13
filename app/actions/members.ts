'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { recordActivity } from '@/src/lib/activity'
import { displayName } from '@/src/lib/display'
import { fetchIdentities } from '@/src/lib/dashboard'
import type { LeagueMemberRow, LeagueRow } from '@/src/db/rows'

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
 * Authorization is enforced here, not by RLS: the service-role key in
 * src/lib/db.ts bypasses RLS entirely, so an in-app check is the only gate. The
 * commissioner check is against leagues.commissioner_id, the source of truth
 * (membership `role` is display state and may lag custom-role work in Phase 2).
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
  const { data: leagueData, error: leagueError } = await db
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()

  if (leagueError) {
    console.error('removeLeagueMember league error:', leagueError)
  }
  if (!leagueData) {
    return { error: 'League not found.' }
  }
  if ((leagueData as unknown as Pick<LeagueRow, 'commissioner_id'>).commissioner_id !== user.id) {
    return { error: 'Only the commissioner can remove members.' }
  }

  // 2. Target must be an active membership row of THIS league. The league_id
  //    filter is what stops a memberId from another league being removed by
  //    id — the unique index makes maybeSingle() safe. user_id/team_name are
  //    carried so the audit event can say *who* left, not just that someone did.
  const { data: targetData, error: targetError } = await db
    .from('league_members')
    .select('role, status, user_id, team_name')
    .eq('id', memberId)
    .eq('league_id', leagueId)
    .maybeSingle()

  if (targetError) {
    console.error('removeLeagueMember target error:', targetError)
  }
  if (!targetData) {
    return { error: 'Member not found in this league.' }
  }

  const target = targetData as unknown as Pick<
    LeagueMemberRow,
    'role' | 'status' | 'user_id' | 'team_name'
  >
  if (target.status !== 'active') {
    return { error: 'This member is not active.' }
  }
  if (target.role === 'commissioner') {
    return { error: 'The commissioner cannot be removed.' }
  }

  // 3. Soft-remove, re-pinning both ids in the WHERE so the row cannot change
  //    league or be re-activated between steps 2 and 3.
  const { error: updateError } = await db
    .from('league_members')
    .update({ status: 'removed' })
    .eq('id', memberId)
    .eq('league_id', leagueId)

  if (updateError) {
    console.error('removeLeagueMember update error:', updateError)
    return { error: 'Could not remove the member. Please try again.' }
  }

  // Audit trail (best-effort — see src/lib/activity.ts). One GoTrue lookup
  // buys a readable "who left" description; if the identity is unreachable
  // we degrade to the team name / generic copy instead of skipping the event.
  const identity = await fetchIdentities([target.user_id])
  const removedName = identity.get(target.user_id)
  const label = removedName
    ? displayName(removedName)
    : target.team_name ?? 'A member'
  await recordActivity(
    leagueId,
    user.id,
    'member_removed',
    `${label} was removed from the league`,
    { memberId, userId: target.user_id, role: target.role, teamName: target.team_name },
  )

  revalidatePath(`/leagues/${leagueId}/members`)
  return {}
}
