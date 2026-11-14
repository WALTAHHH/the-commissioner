/**
 * Invitation reads for the server (Phase 1 / T3).
 *
 * Lives beside — not inside — src/lib/invitations.ts, which is deliberately
 * pure logic with no DB so the validity rules stay unit-testable, and not
 * inside src/lib/dashboard.ts, which is league-dashboard reads.
 *
 * Column names are the raw DB names (see src/lib/db.ts). Rows are handed back
 * with Date objects so `resolveInvitationState` and the invite page can compare
 * against `new Date()` without re-parsing at each call site.
 */

import { db } from '@/src/lib/db'
import type { InvitationRow } from '@/src/db/rows'
import type { InvitationValidity } from '@/src/lib/invitations'
import { looksLikeMissingPlaceholderColumn } from '@/src/lib/placeholder'

/** Invitation columns a caller needs to decide validity + display. */
const INVITATION_SELECT =
  'id, league_id, token, created_by, expires_at, max_uses, use_count, revoked_at, created_at, placeholder_member_id'
// Fallback for deployments where migration 0010 has not been applied yet:
// the same read without the placeholder link, reported as null.
const INVITATION_SELECT_BASE =
  'id, league_id, token, created_by, expires_at, max_uses, use_count, revoked_at, created_at'

export type InvitationRecord = InvitationRow & InvitationValidity

/** League fields an invitation is meaningful alongside. */
export type InvitationLeague = {
  id: string
  name: string
}

function toDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * `maybeSingle` on invitations with the placeholder link, degrading to the
 * pre-0010 column list when the new column does not exist yet (the link then
 * behaves as unlinked, never as a broken lookup).
 */
async function invitationMaybeSingle(
  build: (columns: string) => {
    maybeSingle: () => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
  },
): Promise<{ data: InvitationRow | null; error: unknown }> {
  const first = await build(INVITATION_SELECT).maybeSingle()
  if (!first.error) return { data: (first.data as InvitationRow | null) ?? null, error: null }
  if (!looksLikeMissingPlaceholderColumn(first.error)) {
    return { data: null, error: first.error }
  }
  const retry = await build(INVITATION_SELECT_BASE).maybeSingle()
  if (retry.error || !retry.data) return { data: null, error: retry.error }
  return {
    data: { ...(retry.data as object), placeholder_member_id: null } as InvitationRow,
    error: null,
  }
}

/** PostgREST row → the Date-typed shape resolveInvitationState expects. */
export function toInvitationRecord(row: InvitationRow): InvitationRecord {
  return {
    ...row,
    expiresAt: toDate(row.expires_at),
    revokedAt: toDate(row.revoked_at),
    maxUses: row.max_uses,
    useCount: row.use_count,
  }
}

/**
 * An invitation row by its opaque token, plus the league it points at.
 * Returns null when the token is unknown; `league: null` means the link
 * outlived its league, which callers report as "this league no longer exists".
 */
export async function loadInvitationByToken(
  token: string,
): Promise<{ invitation: InvitationRecord; league: InvitationLeague | null } | null> {
  const { data, error } = await invitationMaybeSingle((columns) =>
    db.from('invitations').select(columns).eq('token', token),
  )

  if (error) {
    console.error('loadInvitationByToken error:', error)
  }
  if (!data) return null

  const invitation = toInvitationRecord(data as unknown as InvitationRow)

  const { data: leagueData, error: leagueError } = await db
    .from('leagues')
    .select('id, name')
    .eq('id', invitation.league_id)
    .maybeSingle()

  if (leagueError) {
    console.error('loadInvitationByToken league error:', leagueError)
  }

  return {
    invitation,
    league: (leagueData ?? null) as InvitationLeague | null,
  }
}

/** The same record by primary key, for the revoke flow. */
export async function loadInvitationById(
  invitationId: string,
): Promise<InvitationRecord | null> {
  const { data, error } = await invitationMaybeSingle((columns) =>
    db.from('invitations').select(columns).eq('id', invitationId),
  )

  if (error) {
    console.error('loadInvitationById error:', error)
  }
  if (!data) return null

  return toInvitationRecord(data as unknown as InvitationRow)
}

/**
 * League owner id, or null when the league does not exist. The service-role
 * client bypasses RLS, so every invitation mutation checks this first.
 */
export async function loadLeagueCommissionerId(
  leagueId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()

  if (error) {
    console.error('loadLeagueCommissionerId error:', error)
  }

  return (
    ((data as unknown as { commissioner_id?: string } | null)?.commissioner_id ?? null)
  )
}
