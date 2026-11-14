'use server'

import { headers } from 'next/headers'
import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { randomUUID } from 'node:crypto'
import {
  INVITATION_STATE_MESSAGE,
  invitationExpiryFrom,
  invitationPath,
  invitationShareUrl,
  isUuid,
  normalizeMaxUses,
  normalizeToken,
  resolveInvitationState,
} from '@/src/lib/invitations'
import {
  loadInvitationById,
  loadInvitationByToken,
  loadLeagueCommissionerId,
  type InvitationRecord,
} from '@/src/lib/invitation-lookup'
import { recordActivity } from '@/src/lib/activity'
import { displayName } from '@/src/lib/display'
import {
  isUniqueViolation,
  loadSettleableSlot,
  loadSlotRow,
  looksLikeMissingPlaceholderColumn,
  settleSlotForUser,
  type SlotSettleResult,
} from '@/src/lib/placeholder'
import type { LeagueMemberRow } from '@/src/db/rows'

/**
 * Invitation links — create, revoke, redeem (Phase 1 / T3).
 *
 * These actions authenticate with the Supabase service-role key (see
 * src/lib/db.ts), which bypasses RLS, so every authorisation check below is
 * in-app: only the league's commissioner may create or revoke a link. The
 * policies in src/db/rls/invitations.sql cover the anon/authenticated path.
 *
 * PostgREST runs one statement per HTTPS request — there is no transaction and
 * no `SELECT … FOR UPDATE`. Where the Drizzle version relied on a transaction
 * for atomicity this now uses a compare-and-swap: the UPDATE carries the value
 * it expects to overwrite (`use_count = <the value just read>`) and returns a
 * row only if it won, so two concurrent redemptions cannot both count. See
 * redeemInvitation for the retry loop built on that.
 *
 * Token entropy: 122 random bits (UUIDv4). Redeem is the only anonymous-facing
 * entry point and it requires a signed-in user, so guessing a live link is not
 * a practical attack; there is deliberately no rate limiter yet (see PR notes).
 */

const TOKEN_COLLISION_ATTEMPTS = 5
/** How many times redeem re-draws a lost use_count race before giving up. */
const REDEEM_CAS_ATTEMPTS = 3

// isUniqueViolation lives in src/lib/placeholder.ts (shared with the merge
// path) — imported above, same 23505 semantics used here since Phase 1.

export interface CreateInvitationResult {
  invitationId?: string
  token?: string
  /** Relative path, always present on success: '/invite/<token>' */
  url?: string
  /** Absolute when the deployment exposes a public origin, else same as url. */
  shareUrl?: string
  expiresAt?: string
  error?: string
}

export interface RevokeInvitationResult {
  invitationId?: string
  revokedAt?: string
  alreadyRevoked?: boolean
  error?: string
}

export interface RedeemInvitationResult {
  ok?: boolean
  leagueId?: string
  leagueName?: string
  /** The user already belonged to the league: no use was burned. */
  alreadyMember?: boolean
  /**
   * Copy describing what happened to a placeholder slot linked to this
   * invite (claimed / merged / still pending), when there was one.
   */
  note?: string
  error?: string
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Create an invite link for a league. Only that league's commissioner may.
 *
 * @param leagueId           uuid of the league
 * @param options.maxUses         null/undefined = unlimited (default)
 * @param options.expiresInSeconds defaults to 7 days, capped at 1 year
 * @returns the shareable URL `/invite/[token]`
 */
export async function createInvitation(
  leagueId: string,
  options: {
    maxUses?: number | null
    expiresInSeconds?: number
    /**
     * Reserve-link: redeeming this invite settles the given placeholder
     * slot (claim, or merge into the joiner's existing row). Must be an
     * unclaimed slot of this league (migration 0010).
     */
    placeholderMemberId?: string | null
  } = {}
): Promise<CreateInvitationResult> {
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league id.' }
  }

  const maxUses = normalizeMaxUses(options.maxUses ?? null)
  if (maxUses === 'invalid') {
    return { error: 'maxUses must be a whole number of 1 or more, or null for unlimited.' }
  }

  const placeholderMemberId = options.placeholderMemberId?.trim() || null
  if (placeholderMemberId && !isUuid(placeholderMemberId)) {
    return { error: 'Invalid member slot.' }
  }

  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in to invite members.' }
  }

  // Ownership check: the caller must be the league's commissioner.
  const commissionerId = await loadLeagueCommissionerId(leagueId)
  if (commissionerId === null) {
    return { error: 'League not found.' }
  }
  if (commissionerId !== user.id) {
    return { error: 'Only the league commissioner can create invite links.' }
  }

  // A reserve-link must point at an unclaimed slot of THIS league; anything
  // else is refused rather than silently degraded to a plain link (the
  // commissioner believes the seat is attached).
  if (placeholderMemberId) {
    const loaded = await loadSlotRow(placeholderMemberId)
    if ('error' in loaded) {
      return { error: loaded.error }
    }
    const slot = loaded.row
    if (!slot || slot.league_id !== leagueId || !slot.is_placeholder) {
      return { error: 'Member slot not found in this league.' }
    }
  }

  const expiresAt = invitationExpiryFrom(options.expiresInSeconds)

  // Insert with retry: the token column is unique, so a (astronomically
  // unlikely) collision surfaces as 23505 and we simply draw another UUID.
  let lastError: unknown
  for (let attempt = 0; attempt < TOKEN_COLLISION_ATTEMPTS; attempt++) {
    const token = randomUUID()

    const { data: inserted, error: insertError } = await db
      .from('invitations')
      .insert({
        league_id: leagueId,
        token,
        created_by: user.id,
        max_uses: maxUses,
        // Serialises to ISO-8601, which PostgREST casts to timestamptz. Sent
        // explicitly rather than omitted so the app decides the lifetime (the
        // DB default of 7 days is only a backstop).
        expires_at: expiresAt,
        ...(placeholderMemberId ? { placeholder_member_id: placeholderMemberId } : {}),
      })
      .select('id, expires_at')
      .single()

    if (insertError || !inserted) {
      lastError = insertError
      // The only way a slot-linked insert fails on the column itself:
      // migration 0010 not applied on this deployment.
      if (placeholderMemberId && looksLikeMissingPlaceholderColumn(insertError)) {
        return { error: 'Member slots are not available yet (migration pending).' }
      }
      if (!isUniqueViolation(insertError)) break
      continue
    }

    const row = inserted as unknown as { id: string; expires_at: string }
    const origin = await safeOriginHeader()

    await recordActivity(
      leagueId,
      user.id,
      'invitation_created',
      'Invite link created',
      { invitationId: row.id, maxUses, expiresAt: row.expires_at },
    )

    return {
      invitationId: row.id,
      token,
      url: invitationPath(token),
      shareUrl: invitationShareUrl(token, origin),
      // Read back from the DB so callers see the stored value, not the one we
      // sent — rounding differences would otherwise be invisible.
      expiresAt: new Date(row.expires_at).toISOString(),
    }
  }

  console.error('createInvitation failed', lastError)
  return { error: 'Could not create the invite link. Please try again.' }
}

/**
 * Revoke an invite link by setting revoked_at. Idempotent from the visitor's
 * point of view: an already-revoked link reports alreadyRevoked, and only the
 * league's commissioner can change anything (checked against the league row
 * before the write, then pinned by the `revoked_at IS NULL` filter on it).
 */
export async function revokeInvitation(
  invitationId: string
): Promise<RevokeInvitationResult> {
  if (!isUuid(invitationId)) {
    return { error: 'Invalid invitation id.' }
  }

  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in to revoke invite links.' }
  }

  const record = await loadInvitationById(invitationId)
  if (!record) {
    return { error: 'Invitation not found.' }
  }

  const commissionerId = await loadLeagueCommissionerId(record.league_id)
  if (commissionerId !== user.id) {
    return { error: 'Only the league commissioner can revoke this invite link.' }
  }

  if (record.revokedAt) {
    return { invitationId: record.id, alreadyRevoked: true }
  }

  // `.is('revoked_at', null)` makes this a one-way door: if another revoke
  // landed between the read above and this update, zero rows match and we
  // report alreadyRevoked rather than overwriting a different timestamp.
  const { data: updated, error: updateError } = await db
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .is('revoked_at', null)
    .select('id, revoked_at')
    .maybeSingle()

  if (updateError) {
    console.error('revokeInvitation update error:', updateError)
    return { error: 'Could not revoke the invite link. Please try again.' }
  }

  if (updated) {
    const row = updated as unknown as { id: string; revoked_at: string }
    return {
      invitationId: row.id,
      revokedAt: new Date(row.revoked_at).toISOString(),
    }
  }

  return { invitationId, alreadyRevoked: true }
}

type JoinOutcome = 'inserted' | 'reactivated' | 'already-active'

/**
 * Display name for the signed-in user doing a redeem — same precedence the
 * directory uses (full_name → name → nickname → email), read from the JWT's
 * user_metadata so no extra GoTrue round-trip is needed for the event.
 */
function joinerName(user: NonNullable<Awaited<ReturnType<typeof requireUser>>>): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null
  return displayName({
    email: user.email ?? null,
    fullName: str(meta.full_name),
    name: str(meta.name),
    nickname: str(meta.nickname),
  })
}

/**
 * After a redemption that never exposed the invitation row to us (the
 * accept_invitation RPC path), settle the placeholder slot linked to the
 * token, if any. Best-effort by construction: the join already succeeded,
 * so a slot left pending is the commissioner's to resolve — never fail or
 * obscure the redemption over it.
 */
async function settleSlotForRedeemedToken(
  token: string,
  leagueId: string,
  user: NonNullable<Awaited<ReturnType<typeof requireUser>>>,
): Promise<string | undefined> {
  try {
    const lookup = await loadInvitationByToken(token)
    if (!lookup?.invitation.placeholder_member_id) return undefined
    const slot = await loadSettleableSlot(lookup.invitation)
    if (!slot || slot.league_id !== leagueId) return undefined
    const settled = await settleSlotForUser(slot, user.id, user.email)
    return await describeSlotSettlement(settled, slot, leagueId, user)
  } catch (err) {
    console.error('slot settlement after redeem failed', err)
    return undefined
  }
}

/**
 * Turn a settle result into (a) an audit event when records actually moved
 * and (b) one line of copy for the redeeming user. 'claimed' and 'merged'
 * are the meaningful outcomes; 'blocked' explains why the reserved seat is
 * still pending.
 */
async function describeSlotSettlement(
  settled: SlotSettleResult,
  slot: LeagueMemberRow,
  leagueId: string,
  user: NonNullable<Awaited<ReturnType<typeof requireUser>>>,
): Promise<string | undefined> {
  const slotLabel = slot.placeholder_name ?? 'A reserved seat'

  if (settled.kind === 'claimed') {
    await recordActivity(
      leagueId,
      user.id,
      'member_placeholder_claimed',
      `${slotLabel} was claimed by ${joinerName(user)}`,
      { placeholderMemberId: slot.id, memberId: settled.memberId, source: 'invitation' },
    )
    return `The seat reserved for ${slotLabel} is now your membership — its history came with it.`
  }

  if (settled.kind === 'merged') {
    await recordActivity(
      leagueId,
      user.id,
      'member_placeholder_merged',
      `${slotLabel} was merged into ${joinerName(user)}`,
      {
        placeholderMemberId: slot.id,
        memberId: settled.memberId,
        moved: settled.moved,
        source: 'invitation',
      },
    )
    return `The history reserved for ${slotLabel} now belongs to your membership.`
  }

  if (settled.kind === 'blocked') {
    return `The seat reserved for ${slotLabel} stays pending: it belongs to a different email address.`
  }

  return undefined
}

/**
 *
 * UNIQUE(league_id, user_id) (T4 schema) is what makes this safe to call
 * twice: a brand-new member gets a row, a soft-removed ex-member is
 * re-activated on the same row, and a race against a concurrent join reports
 * 'already-active'. Only league_id/user_id are sent, so the column defaults
 * decide role ('member') and status ('active') — exactly the old
 * `insert().values({leagueId, userId}).onConflictDoNothing()` behaviour.
 */
async function joinLeague(
  leagueId: string,
  userId: string,
): Promise<JoinOutcome> {
  const { data, error } = await db
    .from('league_members')
    .select('id, status')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  const existing = data as unknown as Pick<LeagueMemberRow, 'id' | 'status'> | null

  if (!existing) {
    const { error: insertError } = await db
      .from('league_members')
      .insert({ league_id: leagueId, user_id: userId })

    if (insertError) {
      // Someone else inserted the same (league, user) pair in the meantime.
      if (isUniqueViolation(insertError)) return 'already-active'
      throw insertError
    }
    return 'inserted'
  }

  if (existing.status === 'active') return 'already-active'

  const { error: updateError } = await db
    .from('league_members')
    .update({ status: 'active' })
    .eq('id', existing.id)
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (updateError) throw updateError
  return 'reactivated'
}

/**
 * Burn exactly one use of an invitation, compare-and-swap style.
 *
 * @returns true when this call performed the increment; false when a
 *          concurrent redemption had already moved use_count off the value we
 *          read (zero rows matched, so double-counting is not possible).
 */
async function burnInvitationUse(invitation: InvitationRecord): Promise<boolean> {
  // use_count is NOT NULL DEFAULT 0, so an equality filter is always
  // well-formed here (a NULL would have needed `.is('use_count', null)`).
  const expected = invitation.useCount ?? 0

  const { data, error } = await db
    .from('invitations')
    .update({ use_count: expected + 1 })
    .eq('id', invitation.id)
    .eq('use_count', expected)
    .select('id')
    .maybeSingle()

  if (error) throw error
  return data !== null
}

/**
 * Redeem an invite link: join the league it points at.
 *
 * Validates the token end to end (exists, not revoked, not expired, under
 * max_uses), writes the league_members row, then burns one use. The old
 * implementation wrapped that in a transaction with the invitation row locked
 * FOR UPDATE; over PostgREST there is no such lock, so the bump is a
 * compare-and-swap against the value just read and the sequence retries (up to
 * REDEEM_CAS_ATTEMPTS) when it loses.
 *
 * Membership semantics (T4): a brand-new member inserts a row; a soft-removed
 * ex-member (status='removed') is re-activated on the same row — both burn a
 * use. An already-active member is a no-op and burns nothing, so double
 * clicking Join is safe.
 */
export async function redeemInvitation(
  token: string
): Promise<RedeemInvitationResult> {
  const normalized = normalizeToken(token)
  if (!normalized) {
    return { error: 'This invite link isn’t valid.' }
  }

  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in to join a league.' }
  }

  try {
    // Try the atomic accept_invitation RPC first (SECURITY DEFINER, one
    // transaction). Falls back to the CAS path when the RPC is not yet
    // deployed, so this PR can ship before the migration runs.
    const rpc = await db.rpc('accept_invitation', {
      p_token: normalized,
      p_user_id: user.id,
    })

    if (!rpc.error) {
      const row = (rpc.data as unknown as Array<Record<string, string>> | null)?.[0]
      if (row) {
        const status = row.status
        const leagueId = row.league_id
        const leagueName = row.league_name
        if (status === 'invalid') {
          return { error: 'This invite link isn’t valid.' }
        }
        if (status === 'already_member') {
          // A slot linked to this invite still settles (merge into the
          // existing row): the commissioner attached the seat to this
          // account on purpose. No use is burned — as for a plain link.
          const note = await settleSlotForRedeemedToken(normalized, leagueId, user)
          return { ok: true, alreadyMember: true, leagueId, leagueName, note }
        }
        await recordActivity(
          leagueId,
          user.id,
          'member_joined',
          `${joinerName(user)} joined the league via invite link`,
          { source: 'invitation' },
        )
        const note = await settleSlotForRedeemedToken(normalized, leagueId, user)
        return { ok: true, leagueId, leagueName, note }
      }
      return { error: 'This invite link isn’t valid.' }
    }

    // 42883 = undefined_function: the migration hasn't run yet. Keep the old
    // PostgREST CAS path alive until it has; anything else is a real failure.
    if (rpc.error.code !== '42883') {
      console.error('accept_invitation RPC failed', rpc.error)
      return { error: 'Could not join the league. Please try again.' }
    }

    // Fallback: CAS path — one statement per HTTPS request, retried on a lost race.
    // Set once THIS request has created or re-activated a membership row, so a
    // CAS retry does not mistake our own write for a pre-existing membership
    // and skip the use it owes.
    let owesUse = false
    let note: string | undefined

    for (let attempt = 0; attempt < REDEEM_CAS_ATTEMPTS; attempt++) {
      const lookup = await loadInvitationByToken(normalized)
      if (!lookup) {
        return { error: 'This invite link isn’t valid.' }
      }

      const { invitation, league } = lookup
      if (!league) {
        return { error: 'This league no longer exists.' }
      }

      const state = resolveInvitationState(invitation)
      if (state !== 'active') {
        return { error: INVITATION_STATE_MESSAGE[state] }
      }

      if (!owesUse) {
        // Placeholder linked to this invite (migration 0010): a brand-new
        // joiner claims the slot in place — same row, same id, every record
        // attached to it just became theirs — instead of inserting a second
        // row. An existing membership settles by merge. The league check
        // guards a (maliciously) mis-linked FK against another league.
        const slot = await loadSettleableSlot(invitation)
        if (slot && slot.league_id === league.id) {
          const settled = await settleSlotForUser(slot, user.id, user.email)
          note = await describeSlotSettlement(settled, slot, league.id, user)
          if (settled.kind === 'claimed') {
            owesUse = true
            await recordActivity(
              league.id,
              user.id,
              'member_joined',
              `${joinerName(user)} claimed a reserved seat via invite link`,
              {
                source: 'invitation',
                invitationId: invitation.id,
                placeholderMemberId: slot.id,
                memberId: settled.memberId,
              },
            )
          }
          // 'merged'/'blocked'/'failed'/'none': the join itself continues on
          // the normal path below (merge already moved the slot's history if
          // it happened; blocked/failed leave the seat for its intended
          // owner or for the commissioner to sort out manually).
        }

        if (!owesUse) {
          const outcome = await joinLeague(league.id, user.id)
          if (outcome === 'already-active') {
            return {
              ok: true,
              alreadyMember: true,
              leagueId: league.id,
              leagueName: league.name,
              note,
            }
          }
          owesUse = true
          // This request created/reactivated the membership: one event, logged
          // here so a lost use_count retry cannot duplicate it.
          await recordActivity(
            league.id,
            user.id,
            'member_joined',
            `${joinerName(user)} joined the league via invite link`,
            { source: 'invitation', invitationId: invitation.id, reactivated: outcome === 'reactivated' },
          )
        }
      }

      if (await burnInvitationUse(invitation)) {
        return { ok: true, leagueId: league.id, leagueName: league.name, note }
      }
      // Lost the race: re-read the invitation (it may meanwhile have hit
      // max_uses or been revoked), re-check validity, re-try the bump.
    }

    // Joined, but never managed to record the use. The membership is the part
    // that matters to the user, so the join stands and max_uses is under-counted
    // by one in this vanishingly rare race. Logged, not silent.
    console.error(
      `redeemInvitation: could not burn a use after ${REDEEM_CAS_ATTEMPTS} attempts (max_uses may be under-counted)`,
    )
    const latest = await loadInvitationByToken(normalized)
    return {
      ok: true,
      leagueId: latest?.league?.id,
      leagueName: latest?.league?.name,
      note,
    }
  } catch (err) {
    console.error('redeemInvitation failed', err)
    return { error: 'Could not join the league. Please try again.' }
  }
}

/** Request origin, if we have one — used only to build an absolute share URL. */
async function safeOriginHeader(): Promise<string | null> {
  try {
    return (await headers()).get('origin')
  } catch {
    return null
  }
}
