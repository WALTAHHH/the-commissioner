'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db } from '@/src/lib/db'
import { invitations } from '@/src/db/schema/invitations'
import { leagues } from '@/src/db/schema/leagues'
import { leagueMembers } from '@/src/db/schema/members'
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

/**
 * Invitation links — create, revoke, redeem (Phase 1 / T3).
 *
 * These actions run on the DATABASE_URL `postgres` role (see src/lib/db.ts),
 * which bypasses RLS, so every authorisation check below is in-app:
 * only the league's commissioner may create or revoke a link. The policies in
 * src/db/rls/invitations.sql cover the anon/authenticated PostgREST path.
 *
 * Token entropy: 122 random bits (UUIDv4). Redeem is the only anonymous-facing
 * entry point and it requires a signed-in user, so guessing a live link is not
 * a practical attack; there is deliberately no rate limiter yet (see PR notes).
 */

const TOKEN_COLLISION_ATTEMPTS = 5

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
  const [league] = await db
    .select({ id: leagues.id, commissionerId: leagues.commissionerId })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1)

  if (!league) {
    return { error: 'League not found.' }
  }
  if (league.commissionerId !== user.id) {
    return { error: 'Only the league commissioner can create invite links.' }
  }

  const expiresAt = invitationExpiryFrom(options.expiresInSeconds)

  // Insert with retry: the token column is unique, so a (astronomically
  // unlikely) collision surfaces as 23505 and we simply draw another UUID.
  let lastError: unknown
  for (let attempt = 0; attempt < TOKEN_COLLISION_ATTEMPTS; attempt++) {
    const token = randomUUID()
    try {
      const [inserted] = await db
        .insert(invitations)
        .values({
          leagueId: league.id,
          token,
          createdBy: user.id,
          maxUses,
          expiresAt,
        })
        .returning({ id: invitations.id, expiresAt: invitations.expiresAt })

      const origin = await safeOriginHeader()

      return {
        invitationId: inserted.id,
        token,
        url: invitationPath(token),
        shareUrl: invitationShareUrl(token, origin),
        expiresAt: inserted.expiresAt.toISOString(),
      }
    } catch (err) {
      lastError = err
      const isTokenConflict =
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'
      if (!isTokenConflict) break
    }
  }

  console.error('createInvitation failed', lastError)
  return { error: 'Could not create the invite link. Please try again.' }
}

/**
 * Revoke an invite link by setting revoked_at. Idempotent from the visitor's
 * point of view: an already-revoked link reports alreadyRevoked, and only the
 * league's commissioner can change anything (enforced in the UPDATE's WHERE).
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

  const revokedAt = new Date()

  // Atomic authorisation: the EXISTS subquery mirrors the RLS policy, so a
  // non-commissioner (or a missing row) simply updates zero rows.
  const [updated] = await db
    .update(invitations)
    .set({ revokedAt })
    .where(
      and(
        eq(invitations.id, invitationId),
        isNull(invitations.revokedAt),
        sql`EXISTS (
               SELECT 1 FROM public.leagues l
               WHERE l.id = invitations.league_id
                 AND l.commissioner_id = ${user.id}
             )`
      )
    )
    .returning({ id: invitations.id, revokedAt: invitations.revokedAt })

  if (updated) {
    return {
      invitationId: updated.id,
      revokedAt: revokedAt.toISOString(),
    }
  }

  // Nothing changed — say precisely why.
  const [existing] = await db
    .select({
      id: invitations.id,
      revokedAt: invitations.revokedAt,
      commissionerId: leagues.commissionerId,
    })
    .from(invitations)
    .innerJoin(leagues, eq(leagues.id, invitations.leagueId))
    .where(eq(invitations.id, invitationId))
    .limit(1)

  if (!existing) {
    return { error: 'Invitation not found.' }
  }
  if (existing.commissionerId !== user.id) {
    return { error: 'Only the league commissioner can revoke this invite link.' }
  }
  if (existing.revokedAt) {
    return { invitationId: existing.id, alreadyRevoked: true }
  }
  return { error: 'Could not revoke the invite link. Please try again.' }
}

/**
 * Redeem an invite link: join the league it points at.
 *
 * Validates the token end to end (exists, not revoked, not expired, under
 * max_uses), writes the league_members row, then burns one use. Runs in a
 * transaction with the invitation row locked FOR UPDATE so two concurrent
 * redemptions cannot both pass the max_uses check.
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
    return await db.transaction(async (tx) => {
      // Lock the invitation so the validity check and the use_count bump are
      // one atomic step.
      const [invitation] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.token, normalized))
        .limit(1)
        .for('update')

      if (!invitation) {
        return { error: 'This invite link isn’t valid.' }
      }

      const state = resolveInvitationState(invitation)
      if (state !== 'active') {
        return { error: INVITATION_STATE_MESSAGE[state] }
      }

      const [league] = await tx
        .select({ id: leagues.id, name: leagues.name })
        .from(leagues)
        .where(eq(leagues.id, invitation.leagueId))
        .limit(1)

      if (!league) {
        return { error: 'This league no longer exists.' }
      }

      // Join, guarded by UNIQUE(league_id, user_id) — T4 canonical schema
      // (src/db/schema/members.ts); user_id FKs auth.users directly, so no
      // public.users mirror dance is needed any more. DO NOTHING keeps a
      // double click from raising; no returned row means a membership row
      // already existed for this (league, user) pair.
      const [member] = await tx
        .insert(leagueMembers)
        .values({ leagueId: league.id, userId: user.id })
        .onConflictDoNothing({
          target: [leagueMembers.leagueId, leagueMembers.userId],
        })
        .returning({ id: leagueMembers.id })

      if (!member) {
        // T4 removal is soft (status='removed'), so a re-invited ex-member
        // re-joins by flipping the same row back to 'active' rather than
        // inserting a duplicate. A still-active row means nothing changes and
        // no use is burned.
        const [existing] = await tx
          .select({ id: leagueMembers.id, status: leagueMembers.status })
          .from(leagueMembers)
          .where(
            and(
              eq(leagueMembers.leagueId, league.id),
              eq(leagueMembers.userId, user.id)
            )
          )
          .limit(1)

        if (!existing || existing.status === 'active') {
          return { ok: true, alreadyMember: true, leagueId: league.id, leagueName: league.name }
        }

        await tx
          .update(leagueMembers)
          .set({ status: 'active' })
          .where(eq(leagueMembers.id, existing.id))
      }

      await tx
        .update(invitations)
        .set({ useCount: sql`${invitations.useCount} + 1` })
        .where(eq(invitations.id, invitation.id))

      return { ok: true, leagueId: league.id, leagueName: league.name }
    })
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
