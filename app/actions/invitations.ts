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
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  )
}

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
  options: { maxUses?: number | null; expiresInSeconds?: number } = {}
): Promise<CreateInvitationResult> {
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league id.' }
  }

  const maxUses = normalizeMaxUses(options.maxUses ?? null)
  if (maxUses === 'invalid') {
    return { error: 'maxUses must be a whole number of 1 or more, or null for unlimited.' }
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
      })
      .select('id, expires_at')
      .single()

    if (insertError || !inserted) {
      lastError = insertError
      if (!isUniqueViolation(insertError)) break
      continue
    }

    const row = inserted as unknown as { id: string; expires_at: string }
    const origin = await safeOriginHeader()

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
 * Make `userId` an active member of `leagueId`, idempotently.
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
          return { ok: true, alreadyMember: true, leagueId, leagueName }
        }
        return { ok: true, leagueId, leagueName }
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
        const outcome = await joinLeague(league.id, user.id)
        if (outcome === 'already-active') {
          return {
            ok: true,
            alreadyMember: true,
            leagueId: league.id,
            leagueName: league.name,
          }
        }
        owesUse = true
      }

      if (await burnInvitationUse(invitation)) {
        return { ok: true, leagueId: league.id, leagueName: league.name }
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
