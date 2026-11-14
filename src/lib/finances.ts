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
import { selectRowsWithColumnFallback } from '@/src/lib/placeholder'
import type {
  FinancialCategoryRow,
  FinancialObligationRow,
  FinancialPaymentRow,
  LeagueMemberRow,
  PrizeStructureRow,
  UserIdentityRow,
} from '@/src/db/rows'
import type { PrizeScope, PrizeType } from '@/src/db/schema/finances'

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

/** One defined prize — payout or recognition, season- or week-scoped (0011). */
export type PrizeView = {
  id: string
  seasonYear: number
  scope: PrizeScope
  type: PrizeType
  /** finishing place for season payouts; null for weekly / recognitions */
  place: number | null
  /** week number for weekly prizes; null for season prizes */
  weekNumber: number | null
  description: string
  /** dollars for payout prizes; null for recognition awards */
  amount: number | null
  winnerMemberId: string | null
  /** resolved display name of the winner; null until awarded */
  winnerName: string | null
  /** ISO timestamp of the award; null until awarded */
  awardedAt: string | null
  createdAt: string
}

/** Prize sections for the prizes page: scope → type → rows. */
export type PrizeSections = {
  season: { payouts: PrizeView[]; recognitions: PrizeView[] }
  weekly: { payouts: PrizeView[]; recognitions: PrizeView[] }
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
  /** placeholder_name while the row is an unclaimed slot (migration 0010). */
  slotName: string | null
}

async function loadMemberDisplayMap(
  leagueId: string,
  memberIds: string[],
): Promise<Map<string, MemberDisplay>> {
  const map = new Map<string, MemberDisplay>()
  if (memberIds.length === 0) return map
  const { rows, error } = await selectRowsWithColumnFallback<LeagueMemberRow>(
    (columns) =>
      db
        .from('league_members')
        .select(columns)
        .eq('league_id', leagueId)
        .in('id', memberIds),
    'id, league_id, user_id, role, team_name, status, joined_at, is_placeholder, placeholder_name',
    'id, league_id, user_id, role, team_name, status, joined_at',
  )
  if (error) {
    console.error('finances members lookup error:', error)
    return map // non-fatal: rows still render with fallback names
  }
  for (const row of rows) {
    map.set(row.id, {
      userId: row.user_id,
      teamName: row.team_name,
      slotName: row.is_placeholder === true ? (row.placeholder_name ?? null) : null,
    })
  }
  return map
}

/**
 * Member name: placeholder display name for reserved seats (0010), else the
 * linked user's display name, else team name, else unknown. Identities are
 * already resolved by the caller's batched fetch.
 */
function memberName(
  display: MemberDisplay | undefined,
  identities: Map<string, UserIdentityRow>,
): string {
  if (!display) return UNKNOWN_MEMBER
  if (display.slotName) return display.slotName
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

/**
 * Legacy season payout ladder (one row per place), ordered 1st → last.
 * Readable by all members. Weekly/recognition prizes are NOT part of this
 * view — the prizes pages read them through `loadPrizes` / `getPrizes`.
 */
export async function loadPrizeStructure(
  leagueId: string,
  seasonYear: number,
): Promise<PrizePlaceView[]> {
  const { data, error } = await db
    .from('prize_structure')
    .select('*')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .eq('scope', 'season')
    .eq('type', 'payout')
    .not('place', 'is', null)
    .order('place', { ascending: true })
  if (error) {
    console.error('loadPrizeStructure error:', error)
    return []
  }
  return ((data ?? []) as unknown as PrizeStructureRow[]).map((r) => ({
    id: r.id,
    seasonYear: r.season_year,
    place: r.place as number, // filtered .not('place','is',null)
    description: r.description,
    amount: toDollars(r.amount ?? 0), // payouts always carry an amount
  }))
}

/** Map a raw prize row to its view, resolving the winner's display name. */
function toPrizeView(
  r: PrizeStructureRow,
  memberMap: Map<string, MemberDisplay>,
  identities: Map<string, UserIdentityRow>,
): PrizeView {
  // Unknown DB values degrade to the defaults the columns themselves carry.
  const scope: PrizeScope = r.scope === 'weekly' ? 'weekly' : 'season'
  const type: PrizeType = r.type === 'recognition' ? 'recognition' : 'payout'
  return {
    id: r.id,
    seasonYear: r.season_year,
    scope,
    type,
    place: r.place,
    weekNumber: r.week_number,
    description: r.description,
    amount:
      r.amount === null || r.amount === undefined ? null : toDollars(r.amount),
    winnerMemberId: r.winner_member_id,
    winnerName: r.winner_member_id
      ? memberName(memberMap.get(r.winner_member_id), identities)
      : null,
    awardedAt: r.awarded_at,
    createdAt: r.created_at,
  }
}

/** Fresh, unshared empty-sections object (callers may mutate the arrays). */
function emptyPrizeSections(): PrizeSections {
  return {
    season: { payouts: [], recognitions: [] },
    weekly: { payouts: [], recognitions: [] },
  }
}

/**
 * All prizes for one season, grouped scope → type, with winner names resolved.
 * Ordering within a group: season payouts by place; weekly prizes by week
 * then creation; season recognitions by creation.
 */
export async function loadPrizes(
  leagueId: string,
  seasonYear: number,
): Promise<PrizeSections> {
  const { data, error } = await db
    .from('prize_structure')
    .select('*')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('loadPrizes error:', error)
    return emptyPrizeSections()
  }

  const rows = (data ?? []) as unknown as PrizeStructureRow[]
  const winnerMemberIds = Array.from(
    new Set(
      rows
        .map((r) => r.winner_member_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const memberMap = await loadMemberDisplayMap(leagueId, winnerMemberIds)
  const identities = await fetchIdentities(
    Array.from(
      new Set(
        Array.from(memberMap.values())
          .map((m) => m.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  )

  const sections = emptyPrizeSections()
  for (const r of rows) {
    const view = toPrizeView(r, memberMap, identities)
    const bucket =
      view.type === 'payout'
        ? sections[view.scope].payouts
        : sections[view.scope].recognitions
    bucket.push(view)
  }

  const byPlace = (a: PrizeView, b: PrizeView) =>
    (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER)
  const byWeekThenCreated = (a: PrizeView, b: PrizeView) =>
    (a.weekNumber ?? Number.MAX_SAFE_INTEGER) -
      (b.weekNumber ?? Number.MAX_SAFE_INTEGER) ||
    a.createdAt.localeCompare(b.createdAt)
  const byCreated = (a: PrizeView, b: PrizeView) =>
    a.createdAt.localeCompare(b.createdAt)

  sections.season.payouts.sort(byPlace)
  sections.season.recognitions.sort(byCreated)
  sections.weekly.payouts.sort(byWeekThenCreated)
  sections.weekly.recognitions.sort(byWeekThenCreated)

  return sections
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
 * Placeholder slots (0010) appear too — recording a debt against a reserved
 * seat is the point of making one — labelled by their slot name.
 */
export async function loadMemberOptions(leagueId: string): Promise<MemberOptionView[]> {
  const { rows, error } = await selectRowsWithColumnFallback<LeagueMemberRow>(
    (columns) =>
      db
        .from('league_members')
        .select(columns)
        .eq('league_id', leagueId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true }),
    'id, league_id, user_id, role, team_name, status, joined_at, is_placeholder, placeholder_name',
    'id, league_id, user_id, role, team_name, status, joined_at',
  )
  if (error) {
    console.error('loadMemberOptions error:', error)
    return []
  }
  const identities = await fetchIdentities(
    rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)),
  )
  return rows.map((r) => ({
    memberId: r.id,
    displayName: memberName(
      {
        userId: r.user_id,
        teamName: r.team_name,
        slotName: r.is_placeholder === true ? (r.placeholder_name ?? null) : null,
      },
      identities,
    ),
    teamName: r.team_name,
  }))
}
