/**
 * Read queries backing the finances pages (Finances-2).
 *
 * Server-only — never import from a client component. Same architecture as
 * `src/lib/rules.ts`: reads go through the service-role client in
 * `src/lib/db.ts` and page access is gated by `loadLeagueContext`, because
 * the `authorize()` stub currently denies every action-layer call (including
 * the read actions merged with Finances-1). Writes stay in
 * `app/actions/finances.ts` — that is the authorization contract the
 * permission-model workstream will honour, and the pages call it directly.
 *
 * Status model (from Finances-1): obligations have no status column; the
 * *effective* status is the status of the obligation's latest payment row,
 * 'pending' when there are none. On top of that this layer derives the
 * UI-only 'partial' badge: some received money but not the full amount.
 *
 * Money is stored `numeric(12,2)` in dollars; PostgREST may serialise it as a
 * number or a string, so every arithmetic pass goes through `toDollars` and
 * sums cents as integers to avoid float drift in totals.
 */

import { db } from '@/src/lib/db'
import { fetchIdentities } from '@/src/lib/dashboard'
import { displayName } from '@/src/lib/display'
import type {
  FinancialCategoryRow,
  FinancialObligationRow,
  FinancialPaymentRow,
  LeagueMemberRow,
  PrizeStructureRow,
  UserIdentityRow,
} from '@/src/db/rows'

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

/** Raw statuses persisted on payment rows. */
export type PaymentStatus = 'pending' | 'received' | 'disputed'

/** Badge status for the UI: raw status, plus derived 'partial'. */
export type DisplayObligationStatus = PaymentStatus | 'partial'

export type FinancesPaymentView = {
  id: string
  amount: number
  status: PaymentStatus
  notes: string | null
  recordedBy: string
  recordedByName: string
  recordedAt: string
}

export type FinancesObligationView = {
  id: string
  memberId: string
  memberName: string
  categoryId: string | null
  categoryName: string | null
  description: string
  amount: number
  /** 'YYYY-MM-DD' or null (no fixed deadline). */
  dueDate: string | null
  paymentInstructions: string | null
  status: DisplayObligationStatus
  /** Sum of this obligation's 'received' payments. */
  paidAmount: number
  createdBy: string
  createdByName: string
  createdAt: string
  payments: FinancesPaymentView[]
}

export type FinancesTotalsView = {
  totalOwed: number
  totalReceived: number
  outstanding: number
}

export type FinancesOverviewView = {
  totals: FinancesTotalsView
  obligations: FinancesObligationView[]
  categories: { id: string; name: string; type: string }[]
}

export type LedgerEntryView = {
  /** Stable synthetic key: `obligation:<uuid>` or `payment:<uuid>`. */
  entryId: string
  type: 'obligation_created' | 'payment_recorded'
  occurredAt: string
  obligationId: string
  description: string
  amount: number
  status: DisplayObligationStatus
  memberId: string
  memberName: string
  actorId: string
  actorName: string
  notes: string | null
}

export type PrizePlaceView = {
  id: string
  seasonYear: number
  place: number
  description: string
  amount: number
}

export type MemberOptionView = {
  /** league_members.id — the id createObligation/createBulkObligations take. */
  memberId: string
  displayName: string
  teamName: string | null
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const UNKNOWN_MEMBER = 'Unknown member'

function toDollars(value: number | string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Integer-cent addition — totals must not accumulate float error. */
function sumDollars(values: number[]): number {
  const cents = values.reduce((acc, v) => acc + Math.round(v * 100), 0)
  return cents / 100
}

function nameFor(identities: Map<string, UserIdentityRow>, userId: string): string {
  const identity = identities.get(userId)
  return identity ? displayName(identity) : UNKNOWN_MEMBER
}

function normalizePaymentStatus(value: string): PaymentStatus {
  return value === 'received' || value === 'disputed' ? value : 'pending'
}

/**
 * Effective status from the latest payment, then 'partial' when the money
 * received covers only part of the obligation. Disputed wins over partial —
 * the dispute is the live signal the commissioner acts on.
 */
function deriveStatus(
  latest: FinancesPaymentView | undefined,
  paidAmount: number,
  amount: number,
): DisplayObligationStatus {
  if (latest?.status === 'disputed') return 'disputed'
  if (latest?.status === 'received') {
    return paidAmount >= amount ? 'received' : 'partial'
  }
  // No payments, or latest still pending.
  return paidAmount > 0 ? 'partial' : 'pending'
}

// ---------------------------------------------------------------------------
// League members (shared join data)
// ---------------------------------------------------------------------------

type MemberDisplay = {
  userId: string | null
  teamName: string | null
}

async function loadMemberDisplayMap(
  leagueId: string,
  memberIds: string[],
): Promise<Map<string, MemberDisplay>> {
  const map = new Map<string, MemberDisplay>()
  if (memberIds.length === 0) return map
  const { data, error } = await db
    .from('league_members')
    .select('id, league_id, user_id, role, team_name, status, joined_at')
    .eq('league_id', leagueId)
    .in('id', memberIds)
  if (error) {
    console.error('finances members lookup error:', error)
    return map // non-fatal: rows still render with fallback names
  }
  for (const row of (data ?? []) as unknown as LeagueMemberRow[]) {
    map.set(row.id, { userId: row.user_id, teamName: row.team_name })
  }
  return map
}

/**
 * Member name: linked user's display name, else team name, else unknown.
 * Identities are already resolved by the caller's batched fetch.
 */
function memberName(
  display: MemberDisplay | undefined,
  identities: Map<string, UserIdentityRow>,
): string {
  if (!display) return UNKNOWN_MEMBER
  if (display.userId) {
    const identity = identities.get(display.userId)
    if (identity) return displayName(identity)
  }
  return display.teamName ?? UNKNOWN_MEMBER
}

// ---------------------------------------------------------------------------
// Overview (hub page)
// ---------------------------------------------------------------------------

/**
 * The viewer's own membership row id, or null when they are not in the
 * league. Pages gate with loadLeagueContext first, so a null here only
 * happens for the commissioner-but-not-member corner case.
 */
export async function loadMembershipId(
  leagueId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('loadMembershipId error:', error)
  return data ? (data as unknown as { id: string }).id : null
}

/**
 * Obligations with payments and league totals.
 *
 * Visibility: commissioner gets every obligation in the league; a member
 * gets only their own (pass `memberId` = their membership row). Totals
 * computed over whatever the viewer may see — the same rule the spec's
 * "Commissioner view / Member view" split asks for.
 */
export async function loadFinancesOverview(
  leagueId: string,
  options: { memberId?: string | null } = {},
): Promise<FinancesOverviewView> {
  const obligationsQuery = db
    .from('financial_obligations')
    .select('*')
    .eq('league_id', leagueId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (options.memberId) {
    obligationsQuery.eq('member_id', options.memberId)
  }

  const { data: obligationData, error: obligationsError } = await obligationsQuery
  if (obligationsError) {
    console.error('loadFinancesOverview obligations error:', obligationsError)
  }
  const obligationRows = (obligationData ?? []) as unknown as FinancialObligationRow[]

  // Payments in one batched pass (N+1 at league scale would be dozens).
  const paymentsByObligation = new Map<string, FinancialPaymentRow[]>()
  if (obligationRows.length > 0) {
    const { data: paymentData, error: paymentsError } = await db
      .from('financial_payments')
      .select('*')
      .in('obligation_id', obligationRows.map((o) => o.id))
      .order('recorded_at', { ascending: true })
    if (paymentsError) {
      console.error('loadFinancesOverview payments error:', paymentsError)
    }
    for (const row of (paymentData ?? []) as unknown as FinancialPaymentRow[]) {
      const list = paymentsByObligation.get(row.obligation_id)
      if (list) list.push(row)
      else paymentsByObligation.set(row.obligation_id, [row])
    }
  }

  const [{ data: categoryData }, memberMap] = await Promise.all([
    db.from('financial_categories').select('*').eq('league_id', leagueId),
    loadMemberDisplayMap(
      leagueId,
      Array.from(new Set(obligationRows.map((o) => o.member_id))),
    ),
  ])
  const categoryById = new Map(
    ((categoryData ?? []) as unknown as FinancialCategoryRow[]).map((c) => [
      c.id,
      c,
    ]),
  )

  // One identity batch for every user id that appears anywhere on the page.
  const userIds = new Set<string>()
  for (const o of obligationRows) userIds.add(o.created_by)
  for (const display of memberMap.values()) if (display.userId) userIds.add(display.userId)
  for (const rows of paymentsByObligation.values()) {
    for (const p of rows) userIds.add(p.recorded_by)
  }
  const identities = await fetchIdentities(Array.from(userIds))

  const obligations: FinancesObligationView[] = obligationRows.map((o) => {
    const payments = (paymentsByObligation.get(o.id) ?? []).map(
      (p): FinancesPaymentView => ({
        id: p.id,
        amount: toDollars(p.amount),
        status: normalizePaymentStatus(p.status),
        notes: p.notes,
        recordedBy: p.recorded_by,
        recordedByName: nameFor(identities, p.recorded_by),
        recordedAt: p.recorded_at,
      }),
    )
    const paidAmount = sumDollars(
      payments.filter((p) => p.status === 'received').map((p) => p.amount),
    )
    const category = o.category_id ? categoryById.get(o.category_id) : undefined
    return {
      id: o.id,
      memberId: o.member_id,
      memberName: memberName(memberMap.get(o.member_id), identities),
      categoryId: o.category_id,
      categoryName: category ? category.name : null,
      description: o.description,
      amount: toDollars(o.amount),
      dueDate: o.due_date,
      paymentInstructions: o.payment_instructions,
      status: deriveStatus(payments[payments.length - 1], paidAmount, toDollars(o.amount)),
      paidAmount,
      createdBy: o.created_by,
      createdByName: nameFor(identities, o.created_by),
      createdAt: o.created_at,
      payments,
    }
  })

  return {
    totals: {
      totalOwed: sumDollars(obligations.map((o) => o.amount)),
      totalReceived: sumDollars(obligations.map((o) => o.paidAmount)),
      outstanding:
        sumDollars(obligations.map((o) => o.amount)) -
        sumDollars(obligations.map((o) => o.paidAmount)),
    },
    obligations,
    categories: Array.from(categoryById.values()).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
    })),
  }
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/**
 * Chronological ledger derived from obligation creations and payment
 * records, oldest first — the same derivation `getLedger()` in the action
 * layer performs, plus display names and member-scoped visibility for the
 * member view (a member only sees entries about their own obligations).
 */
export async function loadFinancesLedger(
  leagueId: string,
  options: { memberId?: string | null } = {},
): Promise<LedgerEntryView[]> {
  const overview = await loadFinancesOverview(leagueId, options)

  const entries: LedgerEntryView[] = []
  for (const o of overview.obligations) {
    entries.push({
      entryId: `obligation:${o.id}`,
      type: 'obligation_created',
      occurredAt: o.createdAt,
      obligationId: o.id,
      description: o.description,
      amount: o.amount,
      status: 'pending',
      memberId: o.memberId,
      memberName: o.memberName,
      actorId: o.createdBy,
      actorName: o.createdByName,
      notes: null,
    })
    for (const p of o.payments) {
      entries.push({
        entryId: `payment:${p.id}`,
        type: 'payment_recorded',
        occurredAt: p.recordedAt,
        obligationId: o.id,
        description: o.description,
        amount: p.amount,
        status: p.status === 'disputed' ? 'disputed' : p.status === 'received' ? 'received' : 'pending',
        memberId: o.memberId,
        memberName: o.memberName,
        actorId: p.recordedBy,
        actorName: p.recordedByName,
        notes: p.notes,
      })
    }
  }

  entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  return entries
}

// ---------------------------------------------------------------------------
// Prize structure
// ---------------------------------------------------------------------------

/**
 * Current season year: the league_seasons row flagged is_current, else the
 * newest season_year, else this calendar year (leagues created before the
 * seasons workstream may have no season rows at all).
 */
export async function loadCurrentSeasonYear(leagueId: string): Promise<number> {
  const { data, error } = await db
    .from('league_seasons')
    .select('season_year, is_current')
    .eq('league_id', leagueId)
    .order('season_year', { ascending: false })
  if (error) console.error('loadCurrentSeasonYear error:', error)
  const rows = (data ?? []) as unknown as { season_year: number; is_current: boolean | null }[]
  const current = rows.find((r) => r.is_current)
  if (current) return current.season_year
  if (rows.length > 0) return rows[0].season_year
  return new Date().getFullYear()
}

/** Prize places for one season, ordered 1st → last. Readable by all members. */
export async function loadPrizeStructure(
  leagueId: string,
  seasonYear: number,
): Promise<PrizePlaceView[]> {
  const { data, error } = await db
    .from('prize_structure')
    .select('*')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .order('place', { ascending: true })
  if (error) {
    console.error('loadPrizeStructure error:', error)
    return []
  }
  return ((data ?? []) as unknown as PrizeStructureRow[]).map((r) => ({
    id: r.id,
    seasonYear: r.season_year,
    place: r.place,
    description: r.description,
    amount: toDollars(r.amount),
  }))
}

/**
 * Financial categories of a league — for the create form's category select
 * and the hub's category grouping label sanity. Ordered by name.
 */
export async function loadFinancialCategories(
  leagueId: string,
): Promise<{ id: string; name: string; type: string }[]> {
  const { data, error } = await db
    .from('financial_categories')
    .select('*')
    .eq('league_id', leagueId)
    .order('name', { ascending: true })
  if (error) {
    console.error('loadFinancialCategories error:', error)
    return []
  }
  return ((data ?? []) as unknown as FinancialCategoryRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
  }))
}

// ---------------------------------------------------------------------------
// Obligation creation form data
// ---------------------------------------------------------------------------

/**
 * Active members a bulk/single obligation can target. Commissioner-only form
 * fetches this; ids are membership rows, matching the action contract.
 */
export async function loadMemberOptions(leagueId: string): Promise<MemberOptionView[]> {
  const { data, error } = await db
    .from('league_members')
    .select('id, league_id, user_id, role, team_name, status, joined_at')
    .eq('league_id', leagueId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
  if (error) {
    console.error('loadMemberOptions error:', error)
    return []
  }
  const rows = (data ?? []) as unknown as LeagueMemberRow[]
  const identities = await fetchIdentities(
    rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)),
  )
  return rows.map((r) => ({
    memberId: r.id,
    displayName: memberName({ userId: r.user_id, teamName: r.team_name }, identities),
    teamName: r.team_name,
  }))
}
