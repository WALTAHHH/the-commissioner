/**
 * Placeholder slots — core server-side operations (migration 0010).
 *
 * A placeholder is a league_members row with `is_placeholder = true` and a
 * NULL `user_id`: a reserved roster slot for someone without an auth
 * account. Everything keyed on league_members.id (obligations, payments
 * through them, poll votes, disputes, announcement reads, awards, season
 * records) attaches to the slot as-is, so the slot can carry real
 * recordkeeping before the person exists.
 *
 * Two ways the slot becomes a real membership:
 *
 *  * CLAIM (`claimPlaceholderRow`) — flips the SAME row: user_id set,
 *    is_placeholder false, claimed_at stamped. Every linked record follows
 *    for free. This is the only path allowed while UNIQUE(league_id,
 *    user_id) leaves the user's slot open, i.e. they have no other
 *    membership row in the league.
 *  * MERGE (`mergePlaceholderInto`) — when the user already holds their own
 *    membership row, claiming would collide on that UNIQUE, so instead we
 *    re-parent every child record onto the real row, drop the duplicate
 *    children that collide (the user's own vote/read wins over the slot's),
 *    inherit role/team_name the commissioner parked on the slot, and delete
 *    the placeholder row last.
 *
 * redeemInvitation uses both: the CAS join path claims in place (no child
 * re-parenting needed); the RPC path has already inserted a fresh row by the
 * time we see the link, so it settles via merge. Both orders converge.
 *
 * PostgREST caveat (see src/lib/db.ts): one statement per request, no
 * transactions. Ordering above is deliberate — the placeholder parent is
 * deleted LAST, so any half-finished merge leaves the slot row in place and
 * the whole operation is retryable. A failed delete lands on an FK error
 * naming the child table that still points at the slot.
 */

import { db } from '@/src/lib/db'
import type { LeagueMemberRow } from '@/src/db/rows'

const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, UNIQUE_VIOLATION)
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === code
  )
}

/** Every league_members column the placeholder flows read. */
export const PLACEHOLDER_SELECT =
  'id, league_id, user_id, role, team_name, status, joined_at, is_placeholder, placeholder_name, placeholder_email, placeholder_notes, claimed_at'

/**
 * The slot/child tables that reference league_members.id, as emitted by the
 * migrations: 0000 (permissions), 0005 (finances), 0007 (governance),
 * 0008 (announcement reads), 0009 (season records + awards). A merge UPDATEs
 * each of these off the placeholder row before deleting it.
 *
 * poll_votes UNIQUE(poll_id, member_id) and announcement_reads
 * UNIQUE(announcement_id, member_id) mean the real member can already own a
 * conflicting child — handled by dropping the slot's side (their own ballot
 * and read-receipts are the truth).
 */
const MERGE_CHILD_REFS = [
  { table: 'member_permission_overrides', column: 'member_id' },
  { table: 'member_roles', column: 'member_id' },
  { table: 'financial_obligations', column: 'member_id' },
  { table: 'poll_votes', column: 'member_id' },
  { table: 'disputes', column: 'raised_by' },
  { table: 'announcement_reads', column: 'member_id' },
  { table: 'season_records', column: 'champion_member_id' },
  { table: 'season_records', column: 'runner_up_member_id' },
  { table: 'league_awards', column: 'member_id' },
] as const

/** The email gate on a slot: unset always passes, set matches case-insensitively. */
export function slotEmailMatches(
  slotEmail: string | null,
  authEmail: string | null | undefined,
): boolean {
  const wanted = slotEmail?.trim().toLowerCase()
  if (!wanted) return true
  const actual = authEmail?.trim().toLowerCase()
  return Boolean(actual) && actual === wanted
}

/**
 * Load one league_members row with the placeholder columns.
 * `null` = row does not exist. A thrown-looking error (PGRST204: the
 * placeholder columns are missing because migration 0010 has not been
 * applied) comes back as an error result — callers degrade instead of
 * breaking.
 */
export async function loadSlotRow(
  memberId: string,
): Promise<{ row: LeagueMemberRow | null } | { error: string }> {
  const { data, error } = await db
    .from('league_members')
    .select(PLACEHOLDER_SELECT)
    .eq('id', memberId)
    .maybeSingle()

  if (error) {
    return { error: 'Member slots are not available yet (migration pending).' }
  }
  return { row: (data ?? null) as unknown as LeagueMemberRow | null }
}

/** The membership row (any status) a real account holds in a league, if any. */
export async function findMembershipRowByUser(
  leagueId: string,
  userId: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await db
    .from('league_members')
    .select('id, status')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('findMembershipRowByUser error:', error)
    return null
  }
  return (data ?? null) as unknown as { id: string; status: string } | null
}

/**
 * Does a live (not revoked, not expired) invitation link this slot?
 * Proof of commissioner intent — required before letting a signed-in user
 * self-claim a slot outside the redeem flow.
 */
export async function hasLiveLinkedInvitation(
  placeholderMemberId: string,
  leagueId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('invitations')
    .select('id')
    .eq('placeholder_member_id', placeholderMemberId)
    .eq('league_id', leagueId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)

  if (error) {
    console.error('hasLiveLinkedInvitation error:', error)
    return false
  }
  return ((data ?? []) as unknown[]).length > 0
}

export type ClaimOutcome =
  /** Slot row is now this user's membership; linked records never moved. */
  | { ok: true; member: LeagueMemberRow }
  /** UNIQUE(league_id, user_id) — the user has their own row; use merge. */
  | { conflict: true }
  | { error: string }

/**
 * Flip a slot row into a real membership for `userId` (one UPDATE, so the
 * migration CHECK is satisfied in the same statement).
 *
 * The `is_placeholder = true` filter makes this idempotent-safe: a second
 * claim of the same slot matches zero rows and reports failure rather than
 * double-stamping claimed_at.
 */
export async function claimPlaceholderRow(
  slot: LeagueMemberRow,
  userId: string,
): Promise<ClaimOutcome> {
  // Pre-check UNIQUE collision so the common "already a member" case gets a
  // clean signal instead of a 23505 from the UPDATE.
  const existing = await findMembershipRowByUser(slot.league_id, userId)
  if (existing) return { conflict: true }

  const { data, error } = await db
    .from('league_members')
    .update({
      user_id: userId,
      is_placeholder: false,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', slot.id)
    .eq('league_id', slot.league_id)
    .eq('is_placeholder', true)
    .select(PLACEHOLDER_SELECT)
    .maybeSingle()

  if (error) {
    // Lost the collision race between the pre-check and the UPDATE.
    if (isUniqueViolation(error)) return { conflict: true }
    console.error('claimPlaceholderRow update error:', error)
    return { error: 'Could not claim the member slot. Please try again.' }
  }
  if (!data) {
    return { error: 'That member slot no longer exists or was already claimed.' }
  }
  return { ok: true, member: data as unknown as LeagueMemberRow }
}

export type MergeOutcome =
  /** Children re-parented, slot row deleted. Counts per table for the audit event. */
  | { ok: true; moved: Record<string, number> }
  | { error: string }

/**
 * Move everything the slot owns onto the user's real membership row, then
 * delete the slot. Callers must have validated both rows belong to the same
 * league and that `slot.is_placeholder` is true.
 */
export async function mergePlaceholderInto(
  slot: LeagueMemberRow,
  real: { id: string; role: string; team_name: string | null },
): Promise<MergeOutcome> {
  if (slot.id === real.id) {
    return { error: 'A slot cannot merge into itself.' }
  }

  const moved: Record<string, number> = {}

  for (const ref of MERGE_CHILD_REFS) {
    const key = `${ref.table}.${ref.column}`
    const { data, error } = await db
      .from(ref.table)
      .update({ [ref.column]: real.id })
      .eq(ref.column, slot.id)
      .select()

    if (error) {
      if (isUniqueViolation(error)) {
        // The real member already owns a row this UNIQUE only allows once
        // (their own vote on the same poll, read receipt, …). Their row is
        // the truth; drop the slot's duplicate instead of moving it.
        const { data: deleted, error: deleteError } = await db
          .from(ref.table)
          .delete()
          .eq(ref.column, slot.id)
        if (deleteError) {
          console.error(`merge child delete failed (${key}):`, deleteError)
          return {
            error: `Could not reconcile ${key} records with the existing member. Please try again.`,
          }
        }
        moved[key] = ((deleted ?? []) as unknown[]).length
        continue
      }
      console.error(`merge child update failed (${key}):`, error)
      return {
        error: `Could not move ${key} records onto the existing member. Please try again.`,
      }
    }
    moved[key] = ((data ?? []) as unknown[]).length
  }

  // Invitations still pointing at the slot lose their link: the slot no
  // longer exists, and a future redemption of the same token should never
  // try to settle into it. (Must run before the DELETE — the FK is NO ACTION.)
  const unlink = await db
    .from('invitations')
    .update({ placeholder_member_id: null })
    .eq('placeholder_member_id', slot.id)
  if (unlink.error) {
    console.error('merge unlink invitations error:', unlink.error)
    return { error: 'Could not unlink the member slot from its invites. Please try again.' }
  }

  // The commissioner parked role/team on the slot; carry them onto the real
  // row where it has nothing of its own yet. Never downgrades a
  // commissioner-role row, and never overwrites a team the user already set.
  const inherit: { role?: string; team_name?: string } = {}
  if (slot.role && slot.role !== 'member' && real.role === 'member') {
    inherit.role = slot.role
  }
  if (!real.team_name && slot.team_name) {
    inherit.team_name = slot.team_name
  }
  if (Object.keys(inherit).length > 0) {
    const { error: inheritError } = await db
      .from('league_members')
      .update(inherit)
      .eq('id', real.id)
      .eq('league_id', slot.league_id)
    if (inheritError) {
      console.error('merge inherit role/team error:', inheritError)
      return { error: 'Could not inherit the slot role/team. Please try again.' }
    }
  }

  // Slot last, so a crash anywhere above leaves a retryable state.
  const { error: deleteError } = await db
    .from('league_members')
    .delete()
    .eq('id', slot.id)
    .eq('is_placeholder', true)

  if (deleteError) {
    console.error('merge delete slot error:', deleteError)
    const suffix = hasCode(deleteError, FOREIGN_KEY_VIOLATION)
      ? ' Some records still reference the slot.'
      : ''
    return { error: `Could not remove the member slot.${suffix} Please try again.` }
  }

  return { ok: true, moved }
}

/**
 * Load the slot a redeemed invitation is linked to, if any — validated
 * against the league actually being joined and still unclaimed.
 *
 * `invitation` comes from loadInvitationByToken/loadInvitationById, which
 * degrade `placeholder_member_id` to null when migration 0010 has not been
 * applied, so every failure here is a silent no-op by design: redeeming a
 * plain link must not change behaviour, and a pending migration must not
 * break a redemption.
 */
export function loadSettleableSlot(invitation: {
  placeholder_member_id?: string | null
}): Promise<LeagueMemberRow | null> {
  // Implementation below kept async-friendly for call-site ergonomics.
  return loadSettleableSlotInner(invitation.placeholder_member_id ?? null)
}

async function loadSettleableSlotInner(
  placeholderMemberId: string | null,
): Promise<LeagueMemberRow | null> {
  if (!placeholderMemberId) return null
  const loaded = await loadSlotRow(placeholderMemberId)
  if ('error' in loaded) return null
  const slot = loaded.row
  // Already claimed/merged (or a mis-linked FK into a different league's
  // claimed row): nothing to settle. The league check itself happens at the
  // call sites, which know the league they just joined.
  if (!slot || !slot.is_placeholder) return null
  return slot
}

export type SlotSettleResult =
  /** Nothing linked / slot vanished: plain join already happened. */
  | { kind: 'none' }
  /** placeholder_email is set and does not match the joiner: join proceeds, slot stays reserved. */
  | { kind: 'blocked' }
  /** Slot row flipped in place — the joiner IS the slot's member row. */
  | { kind: 'claimed'; memberId: string }
  /** Slot's records re-parented onto the joiner's existing membership row. */
  | { kind: 'merged'; memberId: string; moved: Record<string, number> }
  | { kind: 'failed' }

/**
 * Make `userId` the owner of `slot`, by whichever mechanism fits the state:
 * no membership row yet → claim the slot in place; row exists → merge.
 * Idempotent: a slot already owned by this user short-circuits to 'none'.
 */
export async function settleSlotForUser(
  slot: LeagueMemberRow,
  userId: string,
  email: string | null | undefined,
): Promise<SlotSettleResult> {
  if (slot.user_id === userId) return { kind: 'none' }
  if (!slotEmailMatches(slot.placeholder_email, email)) return { kind: 'blocked' }

  const existing = await findMembershipRowByUser(slot.league_id, userId)
  if (existing) {
    const real = await loadSlotRow(existing.id)
    if ('error' in real || !real.row) return { kind: 'failed' }
    const outcome = await mergePlaceholderInto(slot, {
      id: real.row.id,
      role: real.row.role,
      team_name: real.row.team_name,
    })
    if ('error' in outcome) {
      console.error('settleSlotForUser merge error:', outcome.error)
      return { kind: 'failed' }
    }
    return { kind: 'merged', memberId: real.row.id, moved: outcome.moved }
  }

  const outcome = await claimPlaceholderRow(slot, userId)
  if ('ok' in outcome) return { kind: 'claimed', memberId: outcome.member.id }
  if ('conflict' in outcome) {
    // Lost a race to a concurrent join — settle via merge instead of failing.
    const retry = await findMembershipRowByUser(slot.league_id, userId)
    if (!retry) return { kind: 'failed' }
    return settleSlotForUser(slot, userId, email)
  }
  console.error('settleSlotForUser claim error:', outcome.error)
  return { kind: 'failed' }
}

/** league_members column lists shared by display-chain readers. */
export const MEMBER_COLUMNS =
  'id, league_id, user_id, role, team_name, status, joined_at'
export const MEMBER_COLUMNS_WITH_PLACEHOLDER = `${MEMBER_COLUMNS}, is_placeholder, placeholder_name`

/**
 * Run a `league_members` display read that prefers the placeholder columns
 * and degrades to the pre-0010 column list when the migration has not been
 * applied (rows then carry no slot fields and callers render their old
 * fallback names). `build(columns)` must return a finished query for the
 * given select list.
 */
export async function selectRowsWithColumnFallback<T>(
  build: (columns: string) => PromiseLike<{
    data: unknown
    error: { message?: string; code?: string } | null
  }>,
  fullColumns: string,
  baseColumns: string,
): Promise<{ rows: T[]; error: unknown }> {
  const first = await build(fullColumns)
  if (!first.error) return { rows: (first.data ?? []) as T[], error: null }
  if (!looksLikeMissingPlaceholderColumn(first.error)) {
    return { rows: [], error: first.error }
  }
  const retry = await build(baseColumns)
  if (retry.error) return { rows: [], error: retry.error }
  return { rows: (retry.data ?? []) as T[], error: null }
}

/**
 * PostgREST reports an unknown column in a select as PGRST204 (400). The
 * placeholder columns only exist once migration 0010 is applied — readers
 * fall back to the base column list instead of blanking their pages.
 */
export function looksLikeMissingPlaceholderColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'PGRST204') return true
  return typeof e.message === 'string' && /placeholder_(name|email|notes)|is_placeholder|claimed_at/.test(e.message)
}
