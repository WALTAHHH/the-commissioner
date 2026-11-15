/**
 * Member profile — obligations section read layer (and its visibility gate).
 *
 * Server-only — never import from a client component. Same layering as
 * `src/lib/finances.ts`: reads go through the service-role client in
 * `src/lib/db.ts` (which bypasses RLS, so every query carries an explicit
 * `league_id` filter — that IS the tenant-isolation gate) and the page gates
 * access with `loadLeagueContext` before calling anything here.
 *
 * Why this file exists instead of a function in `src/lib/finances.ts`: the
 * profile section needs one thing the finances hub never did — a decision
 * about *whose* money a viewer may see. Money on someone else's profile is a
 * different question from money on your own finances page, so the rule lives
 * in its own module with its own tests rather than as a branch inside the hub
 * loader. Every amount it returns still comes from
 * `loadFinancesOverview(leagueId, { memberId })`, so the numbers on a profile
 * and the numbers in the finances hub agree by construction.
 *
 * Visibility rule (honours the `leagues.financial_visibility` setting that the
 * settings page already writes — `updateLeagueFinancials` in
 * `app/actions/leagues.ts`):
 *
 * | viewer                        | full_transparency | members_see_own | admin_only | role_based |
 * |-------------------------------|-------------------|-----------------|------------|------------|
 * | commissioner                  | full              | full            | full       | full       |
 * | the member themself           | own               | own             | restricted | own        |
 * | another member                | full              | restricted      | restricted | restricted |
 *
 * `role_based` is treated as "own only" until the permission tables
 * (`role_permissions` / `member_permission_overrides` in
 * docs/permission-model-spec.md) are wired to a real `authorize()`. A NULL /
 * unrecognised value is read as `full_transparency`, which is what the
 * settings form shows for a league that has never saved this setting.
 */

import { db } from '@/src/lib/db'
import { isUuid } from '@/src/lib/invitations'
import {
  loadFinancesOverview,
  type FinancesObligationView,
  type FinancesTotalsView,
} from '@/src/lib/finances'

// ---------------------------------------------------------------------------
// Visibility model
// ---------------------------------------------------------------------------

export const FINANCIAL_VISIBILITIES = [
  'full_transparency',
  'members_see_own',
  'admin_only',
  'role_based',
] as const

export type FinancialVisibility = (typeof FINANCIAL_VISIBILITIES)[number]

/** Default applied to a league that has never saved the setting. */
export const DEFAULT_FINANCIAL_VISIBILITY: FinancialVisibility = 'full_transparency'

/**
 * How much of this member's financial record the viewer may see.
 * `full` = commissioner view (the member's whole record), `own` = the member
 * reading their own profile. Both render the same section; only the wording
 * differs.
 */
export type ObligationsScope = 'full' | 'own'

export type ObligationsRestrictedReason =
  /** League is admin-only: members see no financial records, not even their own. */
  | 'admin_only'
  /** League keeps finances private: another member's record is not shared. */
  | 'not_shared'

export type MemberObligationsSectionView =
  | {
      state: 'visible'
      scope: ObligationsScope
      visibility: FinancialVisibility
      obligations: FinancesObligationView[]
      totals: FinancesTotalsView
      /** League-level "how to pay" text; null when the commissioner has not set it. */
      leaguePaymentInstructions: string | null
      /** ISO currency code from the league row; 'USD' when unset. */
      currency: string
      /** Obligations still owed whose due date has passed — drives the callout. */
      overdue: { count: number; amount: number }
    }
  | {
      state: 'restricted'
      reason: ObligationsRestrictedReason
      visibility: FinancialVisibility
    }

/** Narrow an arbitrary DB string to a known mode, defaulting as documented. */
export function normalizeFinancialVisibility(
  raw: string | null | undefined,
): FinancialVisibility {
  const value = (raw ?? '').trim().toLowerCase()
  return (FINANCIAL_VISIBILITIES as readonly string[]).includes(value)
    ? (value as FinancialVisibility)
    : DEFAULT_FINANCIAL_VISIBILITY
}

/**
 * Pure ACL decision, exported so it can be exercised without a database.
 *
 * `isSelf` is deliberately a separate input rather than being derived from ids
 * here: a placeholder slot has `user_id = null`, so "is this the viewer's own
 * record" is a question only the caller's membership lookup can answer.
 */
export function resolveObligationsAccess({
  visibility,
  viewerIsCommissioner,
  isSelf,
}: {
  visibility: FinancialVisibility
  viewerIsCommissioner: boolean
  isSelf: boolean
}): { state: 'visible'; scope: ObligationsScope } | { state: 'restricted'; reason: ObligationsRestrictedReason } {
  if (viewerIsCommissioner) return { state: 'visible', scope: 'full' }

  // admin_only hides financial records from every non-commissioner, including
  // the member's own row — the whole point of the mode is that the ledger is
  // the commissioner's business alone.
  if (visibility === 'admin_only') {
    return { state: 'restricted', reason: 'admin_only' }
  }

  if (isSelf) return { state: 'visible', scope: 'own' }

  if (visibility === 'full_transparency') return { state: 'visible', scope: 'full' }

  // 'members_see_own' and 'role_based' (unwired permissions) both land here.
  return { state: 'restricted', reason: 'not_shared' }
}

// ---------------------------------------------------------------------------
// Overdue derivation
// ---------------------------------------------------------------------------

/**
 * 'YYYY-MM-DD' for a Date in UTC — the same clock the due dates were written
 * with, so a league west of UTC does not mark something overdue a day early.
 */
export function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/**
 * Unpaid and past its due date. Due dates are calendar days ('YYYY-MM-DD'),
 * so a plain string compare is exact and timezone-free; the whole day the
 * obligation is due still counts as on time.
 *
 * 'received' is the only status that means settled — 'pending', 'partial' and
 * 'disputed' all still owe money.
 */
export function isOverdue(
  obligation: Pick<FinancesObligationView, 'dueDate' | 'status'>,
  today: string,
): boolean {
  if (!obligation.dueDate) return false
  if (obligation.status === 'received') return false
  return obligation.dueDate < today
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

type LeagueFinanceRow = {
  financial_visibility: string | null
  payment_instructions: string | null
  currency: string | null
}

type MemberIdentityRow = {
  id: string
  user_id: string | null
}

/**
 * One member's obligations section, ACL-resolved.
 *
 * Three reads: the league's finance settings, the member row (only to learn
 * whether this is the viewer's own record — the page has already 404'd on a
 * missing member), then the member-scoped finances overview. All three are
 * league-filtered. A failure in the settings read degrades to the documented
 * default mode rather than blanking the section; a failure in the overview
 * yields an empty, honest section (the finances layer already logs it).
 */
export async function loadMemberObligationsSection({
  leagueId,
  memberId,
  viewerUserId,
  viewerIsCommissioner,
}: {
  leagueId: string
  memberId: string
  /** null for an unauthenticated viewer — never 'self', never 'full'. */
  viewerUserId: string | null
  viewerIsCommissioner: boolean
}): Promise<MemberObligationsSectionView> {
  if (!isUuid(leagueId) || !isUuid(memberId)) {
    // Unreachable from a page that validates its params; fail closed anyway.
    return {
      state: 'restricted',
      reason: 'not_shared',
      visibility: DEFAULT_FINANCIAL_VISIBILITY,
    }
  }

  const [leagueResult, memberResult] = await Promise.all([
    db
      .from('leagues')
      .select('financial_visibility, payment_instructions, currency')
      .eq('id', leagueId)
      .maybeSingle(),
    db
      .from('league_members')
      .select('id, user_id')
      .eq('league_id', leagueId)
      .eq('id', memberId)
      .maybeSingle(),
  ])

  if (leagueResult.error) {
    console.error('loadMemberObligationsSection league error:', leagueResult.error)
  }
  if (memberResult.error) {
    console.error('loadMemberObligationsSection member error:', memberResult.error)
  }

  const league = (leagueResult.data ?? null) as unknown as LeagueFinanceRow | null
  const member = (memberResult.data ?? null) as unknown as MemberIdentityRow | null

  const visibility = normalizeFinancialVisibility(league?.financial_visibility)
  const isSelf = Boolean(member?.user_id) && member?.user_id === viewerUserId

  const access = resolveObligationsAccess({ visibility, viewerIsCommissioner, isSelf })
  if (access.state === 'restricted') {
    return { state: 'restricted', reason: access.reason, visibility }
  }

  // Member-scoped by construction: even a commissioner sees exactly this
  // member's rows here, never the league-wide ledger.
  const overview = await loadFinancesOverview(leagueId, { memberId })

  const today = toIsoDay(new Date())
  const overdueRows = overview.obligations.filter((o) => isOverdue(o, today))

  return {
    state: 'visible',
    scope: access.scope,
    visibility,
    obligations: overview.obligations,
    totals: overview.totals,
    leaguePaymentInstructions: league?.payment_instructions ?? null,
    currency: (league?.currency ?? 'USD') || 'USD',
    overdue: {
      count: overdueRows.length,
      amount: overdueRows.reduce((acc, o) => acc + Math.max(0, o.amount - o.paidAmount), 0),
    },
  }
}
