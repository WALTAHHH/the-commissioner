'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { recordActivity } from '@/src/lib/activity'
import { displayName } from '@/src/lib/display'
import { fetchIdentities } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import { loadLeagueCommissionerId } from '@/src/lib/invitation-lookup'
import {
  claimPlaceholderRow,
  hasLiveLinkedInvitation,
  loadSlotRow,
  mergePlaceholderInto,
  slotEmailMatches,
} from '@/src/lib/placeholder'
import type { LeagueMemberRow, LeagueRow } from '@/src/db/rows'

export interface RemoveMemberResult {
  error?: string
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The signed-in GoTrue user, or null. Same lookup every member action uses. */
async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

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
    .select('role, status, user_id, team_name, is_placeholder, placeholder_name')
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
    'role' | 'status' | 'user_id' | 'team_name' | 'is_placeholder' | 'placeholder_name'
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
  // Placeholder slots have no account at all (user_id NULL): their label
  // comes from the slot name the commissioner typed (resolution order:
  // placeholder_name → auth identity → team_name → 'A member').
  const removedName = target.user_id
    ? (await fetchIdentities([target.user_id])).get(target.user_id) ?? null
    : null
  const label =
    (target.is_placeholder ? target.placeholder_name : null) ??
    (removedName ? displayName(removedName) : (target.team_name ?? 'A member'))
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

// ---------------------------------------------------------------------------
// Placeholder members (t_9006ef8d / migration 0010)
// ---------------------------------------------------------------------------

/**
 * Roles a slot may carry. 'commissioner' is excluded: leagues.commissioner_id
 * is the source of truth for ownership and the seeded commissioner
 * membership is written by createLeague — a reserved seat must never
 * impersonate it. Kept in sync with MEMBER_ROLES in src/db/schema/members.ts
 * (that file is schema-of-record only; runtime code does not import it).
 */
const PLACEHOLDER_ROLES = ['co_commissioner', 'treasurer', 'member', 'guest'] as const

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface CreatePlaceholderResult {
  memberId?: string
  error?: string
}

/**
 * Reserve a roster slot for someone who has not signed up (commissioner
 * only). The row is an ordinary active membership shape — obligations,
 * votes recorded against it later, awards, reads all key on its id — but
 * carries is_placeholder=true and user_id=NULL until it is claimed.
 */
export async function createPlaceholderMember(
  leagueId: string,
  options: {
    displayName: string
    teamName?: string | null
    role?: string | null
    email?: string | null
    notes?: string | null
  },
): Promise<CreatePlaceholderResult> {
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league id.' }
  }

  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const commissionerId = await loadLeagueCommissionerId(leagueId)
  if (commissionerId === null) {
    return { error: 'League not found.' }
  }
  if (commissionerId !== user.id) {
    return { error: 'Only the league commissioner can add placeholder members.' }
  }

  const displayNameInput = (options.displayName ?? '').trim()
  if (!displayNameInput || displayNameInput.length > 120) {
    return { error: 'Display name is required (max 120 characters).' }
  }

  const teamName = options.teamName?.trim() || null
  if (teamName && teamName.length > 120) {
    return { error: 'Team name is too long (max 120 characters).' }
  }

  const role = options.role?.trim() || 'member'
  if (!(PLACEHOLDER_ROLES as readonly string[]).includes(role)) {
    return { error: 'Invalid role for a placeholder member.' }
  }

  const email = options.email?.trim().toLowerCase() || null
  if (email && (email.length > 320 || !EMAIL_REGEX.test(email))) {
    return { error: 'Email address looks invalid.' }
  }

  const notes = options.notes?.trim() || null
  if (notes && notes.length > 2000) {
    return { error: 'Notes are too long (max 2000 characters).' }
  }

  const { data: inserted, error: insertError } = await db
    .from('league_members')
    .insert({
      league_id: leagueId,
      user_id: null,
      is_placeholder: true,
      placeholder_name: displayNameInput,
      placeholder_email: email,
      placeholder_notes: notes,
      role,
      team_name: teamName,
      status: 'active',
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('createPlaceholderMember insert error:', insertError)
    return { error: 'Could not add the placeholder member. Please try again.' }
  }

  const memberId = (inserted as unknown as { id: string }).id
  await recordActivity(
    leagueId,
    user.id,
    'member_placeholder_created',
    `${displayNameInput} was added as a pending member`,
    { memberId, role, teamName, email },
  )

  revalidatePath(`/leagues/${leagueId}/members`)
  return { memberId }
}

export interface ClaimPlaceholderResult {
  memberId?: string
  error?: string
}

/**
 * Hand a slot row over to a real account (see src/lib/placeholder.ts for
 * what makes a claim different from a merge).
 *
 * Who may call it:
 *   * the league's commissioner — filling a slot for someone is exactly
 *     their authority (remove/re-invite already are);
 *   * the future owner themselves — but only through evidence a stranger
 *     cannot forge: a live invitation explicitly linked to this slot, and
 *     the slot's email gate (placeholder_email, when set, must equal their
 *     auth email). redeemInvitation runs the stronger flow (token +
 *     validity + use accounting); this path exists for the exported
 *     contract and stays conservative.
 */
export async function claimPlaceholder(
  placeholderMemberId: string,
  userId: string,
): Promise<ClaimPlaceholderResult> {
  if (!isUuid(placeholderMemberId) || !isUuid(userId)) {
    return { error: 'Invalid request.' }
  }

  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const loaded = await loadSlotRow(placeholderMemberId)
  if ('error' in loaded) {
    return { error: loaded.error }
  }
  const slot = loaded.row
  if (!slot) {
    return { error: 'Member slot not found.' }
  }
  if (!slot.is_placeholder) {
    return { error: 'This member slot has already been claimed.' }
  }

  const commissionerId = await loadLeagueCommissionerId(slot.league_id)
  if (commissionerId === null) {
    return { error: 'League not found.' }
  }

  const asCommissioner = commissionerId === user.id
  if (!asCommissioner) {
    if (userId !== user.id) {
      return { error: 'You can only claim a member slot for yourself.' }
    }
    if (!slotEmailMatches(slot.placeholder_email, user.email)) {
      return { error: 'This slot was reserved for a different email address.' }
    }
    if (!(await hasLiveLinkedInvitation(slot.id, slot.league_id))) {
      return { error: 'No active invite link is attached to this member slot.' }
    }
  }

  const outcome = await claimPlaceholderRow(slot, userId)
  if ('error' in outcome) {
    return { error: outcome.error }
  }
  if ('conflict' in outcome) {
    return {
      error:
        'That user already holds a membership in this league — merge the slot into it instead.',
    }
  }

  await recordActivity(
    slot.league_id,
    user.id,
    'member_placeholder_claimed',
    `${slot.placeholder_name ?? 'A member'} was claimed by a signed-up member`,
    { placeholderMemberId: slot.id, claimedByUserId: userId },
  )

  revalidatePath(`/leagues/${slot.league_id}/members`)
  return { memberId: slot.id }
}

export interface MergePlaceholderResult {
  moved?: Record<string, number>
  error?: string
}

/**
 * Manually merge an unclaimed slot into an existing membership row
 * (commissioner only): every child record moves to the real row, the slot
 * row is deleted, and parked role/team_name are inherited. Records created
 * by the real member win any UNIQUE collision (their own vote, read
 * receipt). Retry-safe: see src/lib/placeholder.ts for the statement order.
 */
export async function mergePlaceholder(
  placeholderMemberId: string,
  realMemberId: string,
): Promise<MergePlaceholderResult> {
  if (!isUuid(placeholderMemberId) || !isUuid(realMemberId)) {
    return { error: 'Invalid request.' }
  }
  if (placeholderMemberId === realMemberId) {
    return { error: 'A slot cannot merge into itself.' }
  }

  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const loaded = await loadSlotRow(placeholderMemberId)
  if ('error' in loaded) {
    return { error: loaded.error }
  }
  const slot = loaded.row
  if (!slot) {
    return { error: 'Member slot not found.' }
  }
  if (!slot.is_placeholder) {
    return { error: 'This member slot has already been claimed.' }
  }

  const commissionerId = await loadLeagueCommissionerId(slot.league_id)
  if (commissionerId === null) {
    return { error: 'League not found.' }
  }
  if (commissionerId !== user.id) {
    return { error: 'Only the league commissioner can merge member slots.' }
  }

  const realLoaded = await loadSlotRow(realMemberId)
  if ('error' in realLoaded) {
    return { error: 'Existing member not found.' }
  }
  const real = realLoaded.row
  if (!real || real.league_id !== slot.league_id) {
    return { error: 'Existing member not found in this league.' }
  }
  if (real.is_placeholder) {
    return { error: 'The target member must be a signed-up account, not another slot.' }
  }

  const outcome = await mergePlaceholderInto(slot, {
    id: real.id,
    role: real.role,
    team_name: real.team_name,
  })
  if ('error' in outcome) {
    return { error: outcome.error }
  }

  await recordActivity(
    slot.league_id,
    user.id,
    'member_placeholder_merged',
    `${slot.placeholder_name ?? 'A member'} was merged into the existing member`,
    {
      placeholderMemberId: slot.id,
      realMemberId: real.id,
      realUserId: real.user_id,
      moved: outcome.moved,
    },
  )

  revalidatePath(`/leagues/${slot.league_id}/members`)
  return { moved: outcome.moved }
}
