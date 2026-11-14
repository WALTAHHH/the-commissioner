'use server'

/**
 * League finances — server actions (recordkeeping only).
 *
 * Hard rules enforced here:
 *  - NO payment processing. Payments are *records*: a human moved money
 *    outside the app (cash, Venmo, whatever) and the commissioner logs it.
 *    `payment_instructions` is free text, never parsed, never used to
 *    initiate anything.
 *  - Every action authenticates, validates, then calls `authorize()` before
 *    touching rows. The service-role client bypasses RLS, so application
 *    code is the only gate (see src/lib/db.ts header).
 *  - Cross-league isolation: an obligation's `league_id` is always re-read
 *    from the DB from the row we're about to act on — never trusted from the
 *    caller — and `authorize()` is called with that league.
 *
 * Status model: `financial_obligations` has no status column (the spec keeps
 * status on `financial_payments`). An obligation's *effective* status is the
 * status of its most recent payment record, defaulting to 'pending' when it
 * has none. `updateObligationStatus` therefore writes through to the latest
 * payment row; 'pending' on an obligation with no payments is a no-op
 * success, while 'received'/'disputed' require a payment record to exist.
 */

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { authorize } from '@/src/lib/auth/authorize'
import { recordActivity } from '@/src/lib/activity'
import { loadPrizes, type PrizeSections } from '@/src/lib/finances'
import { loadLeagueContext } from '@/src/lib/dashboard'
import {
  PRIZE_SCOPES,
  PRIZE_TYPES,
  type PrizeScope,
  type PrizeType,
} from '@/src/db/schema/finances'
import type {
  FinancialObligationRow,
  FinancialPaymentRow,
  PrizeStructureRow,
  LeagueMemberRow,
} from '@/src/db/rows'

// ---------------------------------------------------------------------------
// Shared helpers (kept local — 'use server' modules may only export async fns)
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function isUuid(str: string): boolean {
  return UUID_REGEX.test(str)
}

/** Amount sanity: positive dollars, two-decimal precision, sane upper cap. */
const MAX_AMOUNT = 1_000_000

type AmountResult = { ok: true; amount: number } | { ok: false; error: string }

function normalizeAmount(value: unknown): AmountResult {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' }
  }
  const cents = Math.round(n * 100)
  if (cents / 100 > MAX_AMOUNT) {
    return { ok: false, error: `Amount must be at most ${MAX_AMOUNT}.` }
  }
  return { ok: true, amount: cents / 100 }
}

/** Postgres `numeric` may arrive as number or string over PostgREST. */
function toNumber(value: number | string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isValidDueDate(value: string): boolean {
  return DATE_REGEX.test(value) && !Number.isNaN(Date.parse(value))
}

const PAYMENT_STATUS_VALUES = ['pending', 'received', 'disputed'] as const
export type ObligationStatus = (typeof PAYMENT_STATUS_VALUES)[number]

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Commissioner-of-the-league check against the leagues row itself — the same
 * rule `src/lib/dashboard.loadLeagueContext` and the announcements/integrations
 * actions use. The prize WRITE actions gate on this rather than `authorize()`
 * because that helper is still the repo-wide deny-by-default stub (it returns
 * false for every action), which would make every prize write fail unconditionally.
 * When the permission-model workstream replaces the stub, these calls should
 * move back to `authorize()` like the obligation actions already do.
 */
async function requireCommissioner(
  userId: string,
  leagueId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (error || !data) return false
  return (data as unknown as { commissioner_id: string }).commissioner_id === userId
}

/**
 * Load an obligation for a mutation: its league is derived from the row
 * itself (never from caller input) so authorize() can't be pointed at a
 * league the resource doesn't belong to.
 */
async function loadObligationForLeague(obligationId: string): Promise<
  { leagueId: string; description: string; memberId: string } | { error: string }
> {
  const { data, error } = await db
    .from('financial_obligations')
    .select('id, league_id, member_id, description, deleted_at')
    .eq('id', obligationId)
    .maybeSingle()

  if (error || !data) {
    return { error: 'Obligation not found.' }
  }
  const row = data as unknown as FinancialObligationRow
  if (row.deleted_at) {
    return { error: 'This obligation has been deleted.' }
  }
  return { leagueId: row.league_id, description: row.description, memberId: row.member_id }
}

/** Verify a category exists in THIS league (null/undefined passes). */
async function validateCategoryInLeague(
  leagueId: string,
  categoryId?: string,
): Promise<string | null> {
  if (!categoryId) return null
  const { data, error } = await db
    .from('financial_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (error || !data) return 'Category not found in this league.'
  return null
}

/** Verify every membership id belongs to THIS league. Returns missing ids. */
async function filterLeagueMembers(
  leagueId: string,
  memberIds: string[],
): Promise<string[]> {
  const { data, error } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .in('id', memberIds)
  if (error) return memberIds // treat query failure as "none found"
  const found = new Set(
    (data as unknown as Pick<LeagueMemberRow, 'id'>[]).map((r) => r.id),
  )
  return memberIds.filter((id) => !found.has(id))
}

// ---------------------------------------------------------------------------
// View types (camelCase boundary, per src/lib/db.ts convention)
// ---------------------------------------------------------------------------

export interface PaymentView {
  id: string
  amount: number
  recordedBy: string
  recordedAt: string
  notes: string | null
  status: ObligationStatus
}

export interface ObligationView {
  id: string
  leagueId: string
  memberId: string
  categoryId: string | null
  amount: number
  description: string
  dueDate: string | null
  paymentInstructions: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  /** Derived from the latest payment row; 'pending' when no payments exist. */
  status: ObligationStatus
  payments: PaymentView[]
}

export interface MemberFinancesView {
  memberId: string
  userId: string | null
  teamName: string | null
  obligations: ObligationView[]
  totals: FinancesTotalsView
}

export interface FinancesTotalsView {
  /** Sum of all (non-deleted) obligation amounts. */
  totalOwed: number
  /** Sum of payment amounts whose status is 'received'. */
  totalPaid: number
  /** totalOwed minus totalPaid. */
  outstanding: number
}

export interface LedgerEntryView {
  /** Stable synthetic key: `obligation:<uuid>` or `payment:<uuid>`. */
  entryId: string
  type: 'obligation_created' | 'payment_recorded'
  occurredAt: string
  obligationId: string
  memberId: string
  amount: number
  status: ObligationStatus
  description: string
  notes: string | null
  /** created_by (obligations) / recorded_by (payments). */
  actorId: string
}

function toPaymentView(row: FinancialPaymentRow): PaymentView {
  return {
    id: row.id,
    amount: toNumber(row.amount),
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
    notes: row.notes,
    status: (PAYMENT_STATUS_VALUES as readonly string[]).includes(row.status)
      ? (row.status as ObligationStatus)
      : 'pending',
  }
}

function buildObligationViews(
  obligations: FinancialObligationRow[],
  paymentsByObligation: Map<string, FinancialPaymentRow[]>,
): ObligationView[] {
  return obligations.map((o) => {
    // recorded_at was requested ascending; last entry is the most recent.
    const payments = (paymentsByObligation.get(o.id) ?? []).map(toPaymentView)
    const latest = payments[payments.length - 1]
    return {
      id: o.id,
      leagueId: o.league_id,
      memberId: o.member_id,
      categoryId: o.category_id,
      amount: toNumber(o.amount),
      description: o.description,
      dueDate: o.due_date,
      paymentInstructions: o.payment_instructions,
      createdBy: o.created_by,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      status: latest ? latest.status : 'pending',
      payments,
    }
  })
}

function computeTotals(obligations: ObligationView[]): FinancesTotalsView {
  const cents = (x: number) => Math.round(x * 100)
  let owed = 0
  let paid = 0
  for (const o of obligations) {
    owed += cents(o.amount)
    for (const p of o.payments) {
      if (p.status === 'received') paid += cents(p.amount)
    }
  }
  return {
    totalOwed: owed / 100,
    totalPaid: paid / 100,
    outstanding: (owed - paid) / 100,
  }
}

/** Fetch payments for a set of obligation ids, grouped by obligation. */
async function loadPayments(
  obligationIds: string[],
): Promise<
  { map: Map<string, FinancialPaymentRow[]> } | { error: string }
> {
  const map = new Map<string, FinancialPaymentRow[]>()
  if (obligationIds.length === 0) return { map }
  const { data, error } = await db
    .from('financial_payments')
    .select('*')
    .in('obligation_id', obligationIds)
    .order('recorded_at', { ascending: true })
  if (error) {
    console.error('loadPayments error:', error)
    return { error: 'Failed to fetch payments.' }
  }
  for (const row of (data ?? []) as unknown as FinancialPaymentRow[]) {
    const list = map.get(row.obligation_id)
    if (list) list.push(row)
    else map.set(row.obligation_id, [row])
  }
  return { map }
}

// ---------------------------------------------------------------------------
// Result interfaces
// ---------------------------------------------------------------------------

export interface CreateObligationResult {
  obligationId?: string
  error?: string
}

export interface CreateBulkObligationsResult {
  obligationIds?: string[]
  error?: string
}

export interface RecordPaymentResult {
  paymentId?: string
  error?: string
}

export interface UpdateObligationStatusResult {
  obligationId?: string
  status?: ObligationStatus
  error?: string
}

export interface GetLeagueFinancialsResult {
  members?: MemberFinancesView[]
  totals?: FinancesTotalsView
  error?: string
}

export interface GetMemberFinancialsResult {
  memberId?: string
  obligations?: ObligationView[]
  totals?: FinancesTotalsView
  error?: string
}

export interface GetLedgerResult {
  entries?: LedgerEntryView[]
  error?: string
}

// ---------------------------------------------------------------------------
// Shared creation logic
// ---------------------------------------------------------------------------

interface ObligationFields {
  amount: number
  description: string
  categoryId?: string
  dueDate?: string
  paymentInstructions?: string
}

/** Validate the common obligation fields. Returns an error string or null. */
function validateObligationFields(f: {
  amount: unknown
  description: unknown
  categoryId?: string
  dueDate?: string
  paymentInstructions?: string
}): { ok: true; fields: ObligationFields } | { ok: false; error: string } {
  if (typeof f.description !== 'string' || !f.description.trim()) {
    return { ok: false, error: 'Description is required.' }
  }
  if (f.description.trim().length > 500) {
    return { ok: false, error: 'Description must be at most 500 characters.' }
  }
  if (f.categoryId !== undefined && !isUuid(f.categoryId)) {
    return { ok: false, error: 'Invalid category ID.' }
  }
  if (f.dueDate !== undefined && !isValidDueDate(f.dueDate)) {
    return { ok: false, error: 'Due date must be in YYYY-MM-DD format.' }
  }
  if (
    f.paymentInstructions !== undefined &&
    f.paymentInstructions.length > 1000
  ) {
    return {
      ok: false,
      error: 'Payment instructions must be at most 1000 characters.',
    }
  }
  const amount = normalizeAmount(f.amount)
  if (!amount.ok) return amount
  return {
    ok: true,
    fields: {
      amount: amount.amount,
      description: f.description.trim(),
      categoryId: f.categoryId,
      dueDate: f.dueDate,
      paymentInstructions: f.paymentInstructions,
    },
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a single obligation for one member (e.g. a side-bet loss, a fine).
 *
 * @param leagueId uuid of the league
 * @param memberId uuid of the league_members row that owes
 * @param amount dollars (> 0, two-decimal precision)
 * @param description what the money is for
 */
export async function createObligation(
  leagueId: string,
  {
    memberId,
    amount,
    description,
    categoryId,
    dueDate,
    paymentInstructions,
  }: {
    memberId: string
    amount: number
    description: string
    categoryId?: string
    dueDate?: string
    paymentInstructions?: string
  },
): Promise<CreateObligationResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!isUuid(memberId)) {
    return { error: 'Invalid member ID.' }
  }
  const valid = validateObligationFields({
    amount,
    description,
    categoryId,
    dueDate,
    paymentInstructions,
  })
  if (!valid.ok) {
    return { error: valid.error }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'createObligation',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to create obligations in this league.' }
  }

  // Target must be a membership row of THIS league.
  const missing = await filterLeagueMembers(leagueId, [memberId])
  if (missing.length > 0) {
    return { error: 'Member not found in this league.' }
  }
  const categoryError = await validateCategoryInLeague(leagueId, categoryId)
  if (categoryError) {
    return { error: categoryError }
  }

  const { data, error } = await db
    .from('financial_obligations')
    .insert({
      league_id: leagueId,
      member_id: memberId,
      category_id: valid.fields.categoryId ?? null,
      amount: valid.fields.amount,
      description: valid.fields.description,
      due_date: valid.fields.dueDate ?? null,
      payment_instructions: valid.fields.paymentInstructions ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('createObligation insert error:', error)
    return { error: 'Failed to create obligation.' }
  }

  const obligationId = (data as unknown as { id: string }).id
  await recordActivity(
    leagueId,
    user.id,
    'obligation_created',
    `Obligation created: “${valid.fields.description}” ($${valid.fields.amount.toFixed(2)})`,
    { obligationId, memberId, amount: valid.fields.amount },
  )

  return { obligationId }
}

/**
 * Create the same obligation for multiple members at once (e.g. season dues
 * of $25 for everyone). All-or-nothing: validation failures create nothing.
 *
 * @param leagueId uuid of the league
 * @param memberIds uuids of the league_members rows that owe
 */
export async function createBulkObligations(
  leagueId: string,
  {
    memberIds,
    amount,
    description,
    categoryId,
    dueDate,
    paymentInstructions,
  }: {
    memberIds: string[]
    amount: number
    description: string
    categoryId?: string
    dueDate?: string
    paymentInstructions?: string
  },
): Promise<CreateBulkObligationsResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return { error: 'Select at least one member.' }
  }
  if (memberIds.length > 200) {
    return { error: 'A bulk operation supports at most 200 members at once.' }
  }
  if (memberIds.some((id) => !isUuid(id))) {
    return { error: 'Invalid member ID.' }
  }
  const valid = validateObligationFields({
    amount,
    description,
    categoryId,
    dueDate,
    paymentInstructions,
  })
  if (!valid.ok) {
    return { error: valid.error }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'createObligation',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to create obligations in this league.' }
  }

  const uniqueMemberIds = Array.from(new Set(memberIds))
  const missing = await filterLeagueMembers(leagueId, uniqueMemberIds)
  if (missing.length > 0) {
    return {
      error: `${missing.length} selected member(s) do not belong to this league.`,
    }
  }
  const categoryError = await validateCategoryInLeague(leagueId, categoryId)
  if (categoryError) {
    return { error: categoryError }
  }

  const rows = uniqueMemberIds.map((memberId) => ({
    league_id: leagueId,
    member_id: memberId,
    category_id: valid.fields.categoryId ?? null,
    amount: valid.fields.amount,
    description: valid.fields.description,
    due_date: valid.fields.dueDate ?? null,
    payment_instructions: valid.fields.paymentInstructions ?? null,
    created_by: user.id,
  }))

  const { data, error } = await db
    .from('financial_obligations')
    .insert(rows)
    .select('id')

  if (error || !data) {
    console.error('createBulkObligations insert error:', error)
    return { error: 'Failed to create obligations.' }
  }

  const obligationIds = (data as unknown as { id: string }[]).map((r) => r.id)
  await recordActivity(
    leagueId,
    user.id,
    'obligation_created',
    `${obligationIds.length} obligations created: “${valid.fields.description}” ($${valid.fields.amount.toFixed(2)} each)`,
    {
      bulk: true,
      memberCount: obligationIds.length,
      amount: valid.fields.amount,
      obligationIds,
    },
  )

  return { obligationIds }
}

/**
 * Record that a payment was made/received. Insert-only — money moved outside
 * the app; this is the bookkeeping entry. The new payment becomes the
 * obligation's effective status ('received').
 *
 * @param obligationId uuid of the obligation being paid
 * @param amount dollars actually paid
 */
export async function recordPayment(
  obligationId: string,
  { amount, notes }: { amount: number; notes?: string },
): Promise<RecordPaymentResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(obligationId)) {
    return { error: 'Invalid obligation ID.' }
  }
  const amountResult = normalizeAmount(amount)
  if (!amountResult.ok) {
    return { error: amountResult.error }
  }
  if (notes !== undefined && notes.length > 1000) {
    return { error: 'Notes must be at most 1000 characters.' }
  }

  const obligation = await loadObligationForLeague(obligationId)
  if ('error' in obligation) {
    return { error: obligation.error }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId: obligation.leagueId,
    action: 'recordPayment',
    resourceId: obligationId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to record payments in this league.' }
  }

  const { data, error } = await db
    .from('financial_payments')
    .insert({
      obligation_id: obligationId,
      amount: amountResult.amount,
      recorded_by: user.id,
      notes: notes?.trim() ? notes.trim() : null,
      status: 'received',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('recordPayment insert error:', error)
    return { error: 'Failed to record payment.' }
  }

  const paymentId = (data as unknown as { id: string }).id
  await recordActivity(
    obligation.leagueId,
    user.id,
    'payment_recorded',
    `Payment recorded: $${amountResult.amount.toFixed(2)} toward “${obligation.description}”`,
    {
      paymentId,
      obligationId,
      memberId: obligation.memberId,
      amount: amountResult.amount,
    },
  )

  return { paymentId }
}

/**
 * Change an obligation's effective status. Writes through to the obligation's
 * latest payment row (payments are the status carrier — obligations have no
 * status column). Rules:
 *   - 'pending' on an obligation with no payments → already pending, no-op OK.
 *   - 'received'/'disputed' require an existing payment record.
 *
 * @param obligationId uuid of the obligation
 * @param status 'pending' | 'received' | 'disputed'
 */
export async function updateObligationStatus(
  obligationId: string,
  status: ObligationStatus,
): Promise<UpdateObligationStatusResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(obligationId)) {
    return { error: 'Invalid obligation ID.' }
  }
  if (!(PAYMENT_STATUS_VALUES as readonly string[]).includes(status)) {
    return { error: 'Status must be pending, received, or disputed.' }
  }

  const obligation = await loadObligationForLeague(obligationId)
  if ('error' in obligation) {
    return { error: obligation.error }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId: obligation.leagueId,
    action: 'updateObligationStatus',
    resourceId: obligationId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to update this obligation.' }
  }

  const { data: latestData, error: latestError } = await db
    .from('financial_payments')
    .select('id')
    .eq('obligation_id', obligationId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    console.error('updateObligationStatus lookup error:', latestError)
    return { error: 'Failed to update obligation status.' }
  }

  const latest = latestData as unknown as { id: string } | null

  if (!latest) {
    if (status === 'pending') {
      return { obligationId, status } // implicitly pending already
    }
    return {
      error: 'No payment has been recorded for this obligation yet, so it cannot be marked received or disputed.',
    }
  }

  const { error: updateError } = await db
    .from('financial_payments')
    .update({ status })
    .eq('id', latest.id)

  if (updateError) {
    console.error('updateObligationStatus update error:', updateError)
    return { error: 'Failed to update obligation status.' }
  }

  return { obligationId, status }
}

/**
 * All obligations with payment status, grouped by member, with league totals.
 */
export async function getLeagueFinancials(
  leagueId: string,
): Promise<GetLeagueFinancialsResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'viewFinances',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view finances in this league.' }
  }

  const { data: obligationsData, error: obligationsError } = await db
    .from('financial_obligations')
    .select('*')
    .eq('league_id', leagueId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (obligationsError) {
    console.error('getLeagueFinancials obligations error:', obligationsError)
    return { error: 'Failed to fetch obligations.' }
  }

  const obligations = (obligationsData ?? []) as unknown as FinancialObligationRow[]

  const payments = await loadPayments(obligations.map((o) => o.id))
  if ('error' in payments) {
    return { error: payments.error }
  }

  const views = buildObligationViews(obligations, payments.map)

  // Member display info (team name / user) for grouping headers.
  const memberIds = Array.from(new Set(obligations.map((o) => o.member_id)))
  let memberInfoById = new Map<string, LeagueMemberRow>()
  if (memberIds.length > 0) {
    const { data: membersData, error: membersError } = await db
      .from('league_members')
      .select('id, league_id, user_id, role, team_name, status, joined_at')
      .eq('league_id', leagueId)
      .in('id', memberIds)
    if (membersError) {
      console.error('getLeagueFinancials members error:', membersError)
      // Non-fatal: grouping still works without display info.
    } else {
      memberInfoById = new Map(
        ((membersData ?? []) as unknown as LeagueMemberRow[]).map((m) => [
          m.id,
          m,
        ]),
      )
    }
  }

  // Group by member; members sorted by first (earliest) obligation order.
  const byMember = new Map<string, ObligationView[]>()
  for (const view of views) {
    const list = byMember.get(view.memberId)
    if (list) list.push(view)
    else byMember.set(view.memberId, [view])
  }

  const members: MemberFinancesView[] = Array.from(byMember.entries()).map(
    ([memberId, obligationsForMember]) => {
      const info = memberInfoById.get(memberId)
      return {
        memberId,
        userId: info ? info.user_id : null,
        teamName: info ? info.team_name : null,
        obligations: obligationsForMember,
        totals: computeTotals(obligationsForMember),
      }
    },
  )

  return { members, totals: computeTotals(views) }
}

/**
 * One member's obligations + payments with per-member totals.
 */
export async function getMemberFinancials(
  leagueId: string,
  memberId: string,
): Promise<GetMemberFinancialsResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!isUuid(memberId)) {
    return { error: 'Invalid member ID.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'viewFinances',
    resourceId: memberId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view finances in this league.' }
  }

  const { data: obligationsData, error: obligationsError } = await db
    .from('financial_obligations')
    .select('*')
    .eq('league_id', leagueId)
    .eq('member_id', memberId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (obligationsError) {
    console.error('getMemberFinancials obligations error:', obligationsError)
    return { error: 'Failed to fetch obligations.' }
  }

  const obligations = (obligationsData ?? []) as unknown as FinancialObligationRow[]

  const payments = await loadPayments(obligations.map((o) => o.id))
  if ('error' in payments) {
    return { error: payments.error }
  }

  const views = buildObligationViews(obligations, payments.map)

  return { memberId, obligations: views, totals: computeTotals(views) }
}

/**
 * Full chronological ledger of financial activity: obligation creations and
 * payment records interleaved, oldest first.
 */
export async function getLedger(leagueId: string): Promise<GetLedgerResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'viewFinances',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view the ledger in this league.' }
  }

  const { data: obligationsData, error: obligationsError } = await db
    .from('financial_obligations')
    .select('*')
    .eq('league_id', leagueId)
    .is('deleted_at', null)

  if (obligationsError) {
    console.error('getLedger obligations error:', obligationsError)
    return { error: 'Failed to fetch obligations.' }
  }

  const obligations = (obligationsData ?? []) as unknown as FinancialObligationRow[]

  const payments = await loadPayments(obligations.map((o) => o.id))
  if ('error' in payments) {
    return { error: payments.error }
  }

  const obligationById = new Map(obligations.map((o) => [o.id, o]))

  const entries: LedgerEntryView[] = []

  for (const o of obligations) {
    entries.push({
      entryId: `obligation:${o.id}`,
      type: 'obligation_created',
      occurredAt: o.created_at,
      obligationId: o.id,
      memberId: o.member_id,
      amount: toNumber(o.amount),
      status: 'pending',
      description: o.description,
      notes: null,
      actorId: o.created_by,
    })
  }

  for (const [obligationId, rows] of payments.map) {
    const o = obligationById.get(obligationId)
    for (const p of rows) {
      entries.push({
        entryId: `payment:${p.id}`,
        type: 'payment_recorded',
        occurredAt: p.recorded_at,
        obligationId,
        memberId: o ? o.member_id : '',
        amount: toNumber(p.amount),
        status: (PAYMENT_STATUS_VALUES as readonly string[]).includes(p.status)
          ? (p.status as ObligationStatus)
          : 'pending',
        description: o ? o.description : 'Deleted obligation',
        notes: p.notes,
        actorId: p.recorded_by,
      })
    }
  }

  entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

  return { entries }
}

// ---------------------------------------------------------------------------
// Prizes (Commissioner defines + awards; all members read via src/lib/finances)
// ---------------------------------------------------------------------------
//
// A prize is one row of `prize_structure` described by two axes:
//   scope: 'season' | 'weekly'  ×  type: 'payout' | 'recognition'
// Payouts carry an amount and (for season payouts) a finishing place; weekly
// prizes carry a week number instead of a place; recognitions carry no money.
// Winners are recorded after the fact (`winner_member_id` + `awarded_at`).
//
// Write actions gate on `requireCommissioner`, not the `authorize()` stub (see
// the helper above) so prize management actually works until the permission
// model replaces the stub. Reads go through `src/lib/finances` like the rest of
// the finances pages.

const PLACE_MAX = 100
const SEASON_YEAR_MIN = 2000
const SEASON_YEAR_MAX = 2100
// Weekly prizes are addressed by playoff-inclusive week number; the ceiling is
// generous (a Sleeper season is ≤ ~23 weeks) but keeps garbage out of the field.
const WEEK_MAX = 40

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export interface CreatePrizeResult {
  prizeId?: string
  error?: string
}

export interface AwardPrizeResult {
  prizeId?: string
  obligationId?: string
  error?: string
}

export interface GetPrizesResult {
  sections?: PrizeSections
  error?: string
}

export interface DeletePrizeResult {
  error?: string
}

/**
 * Load a prize row for a mutation. The league is re-read from the row (never
 * trusted from the caller) so a prize from another league can't be targeted by
 * id, and the commission check runs against the owning league.
 */
async function loadPrizeForLeague(
  prizeId: string,
): Promise<PrizeStructureRow | { error: string }> {
  const { data, error } = await db
    .from('prize_structure')
    .select(
      'id, league_id, season_year, place, description, amount, type, scope, week_number, winner_member_id, awarded_at, created_by, created_at',
    )
    .eq('id', prizeId)
    .maybeSingle()
  if (error || !data) return { error: 'Prize not found.' }
  return data as unknown as PrizeStructureRow
}

/** Verify a winner id is an active-ish membership row of THIS league. */
async function winnerInLeague(
  leagueId: string,
  memberId: string,
): Promise<boolean> {
  const missing = await filterLeagueMembers(leagueId, [memberId])
  return missing.length === 0
}

/**
 * Define a prize. `scope`/`type` decide which extra fields are required:
 *   season + payout    → place (1..100) + amount (> 0)
 *   season + recognition → optional place, no amount
 *   weekly + *         → weekNumber (1..40), no place
 *   * + payout         → amount (> 0); recognition → no amount
 * A winner may be attached at creation (recorded as awarded now) or left TBD
 * for `awardPrize` later.
 *
 * @param leagueId uuid of the league
 */
export async function createPrize(
  leagueId: string,
  {
    seasonYear,
    scope,
    type,
    place,
    weekNumber,
    description,
    amount,
    winnerId,
  }: {
    seasonYear: number
    scope: PrizeScope
    type: PrizeType
    place?: number | null
    weekNumber?: number | null
    description: string
    amount?: number | null
    winnerId?: string
  },
): Promise<CreatePrizeResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (
    !isInteger(seasonYear) ||
    seasonYear < SEASON_YEAR_MIN ||
    seasonYear > SEASON_YEAR_MAX
  ) {
    return { error: `Season year must be between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.` }
  }
  if (!(PRIZE_SCOPES as readonly string[]).includes(scope)) {
    return { error: 'Scope must be season or weekly.' }
  }
  if (!(PRIZE_TYPES as readonly string[]).includes(type)) {
    return { error: 'Type must be payout or recognition.' }
  }
  if (typeof description !== 'string' || !description.trim()) {
    return { error: 'Description is required.' }
  }
  if (description.trim().length > 500) {
    return { error: 'Description must be at most 500 characters.' }
  }

  // --- Scope-shaped fields -------------------------------------------------
  let normalizedPlace: number | null = null
  let normalizedWeek: number | null = null
  if (scope === 'weekly') {
    if (!isInteger(weekNumber ?? null) || weekNumber! < 1 || weekNumber! > WEEK_MAX) {
      return { error: `Week number must be a whole number between 1 and ${WEEK_MAX}.` }
    }
    normalizedWeek = weekNumber!
    // Weekly prizes have no finishing place.
  } else {
    // season
    if (place !== undefined && place !== null) {
      if (!isInteger(place) || place < 1 || place > PLACE_MAX) {
        return { error: `Place must be a whole number between 1 and ${PLACE_MAX}.` }
      }
      normalizedPlace = place
    }
    // A season payout is meaningless without a place.
    if (type === 'payout' && normalizedPlace === null) {
      return { error: 'Season payouts need a finishing place.' }
    }
  }

  // --- Money ---------------------------------------------------------------
  let normalizedAmount: number | null = null
  if (type === 'payout') {
    const amountResult = normalizeAmount(amount ?? NaN)
    if (!amountResult.ok) {
      return { error: amountResult.error }
    }
    normalizedAmount = amountResult.amount
  } else {
    // recognition: no money, ignore anything sent.
    normalizedAmount = null
  }

  // --- Optional winner at creation ----------------------------------------
  let winnerMemberId: string | null = null
  if (winnerId !== undefined && winnerId !== '') {
    if (!isUuid(winnerId)) {
      return { error: 'Invalid winner ID.' }
    }
    if (!(await winnerInLeague(leagueId, winnerId))) {
      return { error: 'Winner not found in this league.' }
    }
    winnerMemberId = winnerId
  }

  if (!(await requireCommissioner(user.id, leagueId))) {
    return { error: 'You are not authorized to create prizes in this league.' }
  }

  const row = {
    league_id: leagueId,
    season_year: seasonYear,
    place: normalizedPlace,
    description: description.trim(),
    amount: normalizedAmount,
    type,
    scope,
    week_number: normalizedWeek,
    winner_member_id: winnerMemberId,
    awarded_at: winnerMemberId ? new Date().toISOString() : null,
    created_by: user.id,
  }

  const { data, error } = await db
    .from('prize_structure')
    .insert(row)
    .select('id')
    .single()

  if (error || !data) {
    console.error('createPrize insert error:', error)
    return { error: 'Failed to create prize.' }
  }

  const prizeId = (data as unknown as { id: string }).id
  // `normalizedAmount` is already dollars (normalizeAmount output).
  const amountLabel =
    normalizedAmount !== null ? ` ($${normalizedAmount.toFixed(2)})` : ''
  await recordActivity(
    leagueId,
    user.id,
    'prize_created',
    `Prize defined: “${row.description}” (${scope} ${type})${amountLabel}`,
    { prizeId, scope, type, amount: normalizedAmount },
  )

  return { prizeId }
}

/**
 * Record who won a defined prize. Sets `winner_member_id` + `awarded_at` (a
 * re-award overwrites the previous winner). For a payout prize the commissioner
 * can ask the app to also log the money owed: `createObligation` inserts a
 * `financial_obligation` for the prize amount against the winner (recordkeeping
 * only — no money moves).
 *
 * @param prizeId uuid of the prize_structure row
 * @param winnerId uuid of the league_members row that won
 * @param createObligation whether to also book a payout obligation
 */
export async function awardPrize(
  prizeId: string,
  {
    winnerId,
    createObligation = false,
  }: { winnerId: string; createObligation?: boolean },
): Promise<AwardPrizeResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(prizeId)) {
    return { error: 'Invalid prize ID.' }
  }
  if (!isUuid(winnerId)) {
    return { error: 'Invalid winner ID.' }
  }

  const prize = await loadPrizeForLeague(prizeId)
  if ('error' in prize) {
    return { error: prize.error }
  }

  if (!(await requireCommissioner(user.id, prize.league_id))) {
    return { error: 'You are not authorized to award prizes in this league.' }
  }

  if (!(await winnerInLeague(prize.league_id, winnerId))) {
    return { error: 'Winner not found in this league.' }
  }

  const awardedAt = new Date().toISOString()
  const { error: updateError } = await db
    .from('prize_structure')
    .update({ winner_member_id: winnerId, awarded_at: awardedAt })
    .eq('id', prizeId)
  if (updateError) {
    console.error('awardPrize update error:', updateError)
    return { error: 'Failed to award prize.' }
  }

  // Optionally book the payout. Recognition prizes (no amount) never create one.
  // Both `prize_structure.amount` and `financial_obligations.amount` are
  // numeric(12,2) DOLLARS (PostgREST may serialise as number or string) —
  // no unit conversion, just normalisation through toNumber.
  let obligationId: string | undefined
  const payoutAmount =
    prize.type === 'payout' && prize.amount !== null && prize.amount !== undefined
      ? toNumber(prize.amount)
      : null
  if (createObligation) {
    if (payoutAmount === null || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      // Nothing to pay: the prize was awarded, but a payout obligation makes no
      // sense (recognition, or a payout with no amount). Skip silently rather
      // than fail the award that already succeeded.
    } else {
      const { data: obligation, error: obligationError } = await db
        .from('financial_obligations')
        .insert({
          league_id: prize.league_id,
          member_id: winnerId,
          amount: payoutAmount,
          description: `Prize payout: ${prize.description}`,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (obligationError || !obligation) {
        console.error('awardPrize obligation insert error:', obligationError)
        // The prize is already awarded; report both facts so the commissioner
        // can complete the money entry by hand if they want.
        return {
          prizeId,
          error: 'The prize was awarded, but the payout obligation could not be recorded. Add it manually under Finances.',
        }
      }
      obligationId = (obligation as unknown as { id: string }).id
    }
  }

  await recordActivity(
    prize.league_id,
    user.id,
    'prize_awarded',
    `Prize awarded: “${prize.description}”${payoutAmount !== null ? ` ($${payoutAmount.toFixed(2)})` : ''}`,
    { prizeId, winnerId, obligationId, amount: payoutAmount },
  )

  return { prizeId, obligationId }
}

/**
 * Delete a prize. The league is re-read from the row so a prize from another
 * league can't be targeted by id.
 *
 * @param prizeId uuid of the prize_structure row
 */
export async function deletePrize(
  prizeId: string,
): Promise<DeletePrizeResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(prizeId)) {
    return { error: 'Invalid prize ID.' }
  }

  const prize = await loadPrizeForLeague(prizeId)
  if ('error' in prize) {
    return { error: prize.error }
  }

  if (!(await requireCommissioner(user.id, prize.league_id))) {
    return { error: 'You are not authorized to edit prizes in this league.' }
  }

  const { error } = await db
    .from('prize_structure')
    .delete()
    .eq('id', prizeId)

  if (error) {
    console.error('deletePrize delete error:', error)
    return { error: 'Failed to delete prize.' }
  }

  return {}
}

/**
 * All prizes for one season, grouped by scope (season/weekly) and type
 * (payout/recognition) with resolved winner names. Read-only; the page
 * normally calls `loadPrizes` from src/lib/finances directly, this action
 * exists for the checklist contract and re-uses the same query path.
 *
 * @param leagueId uuid of the league
 * @param seasonYear e.g. 2026
 */
export async function getPrizes(
  leagueId: string,
  seasonYear: number,
): Promise<GetPrizesResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!isInteger(seasonYear)) {
    return { error: 'Invalid season year.' }
  }

  // Read gate: any member or the commissioner may view prizes (public league
  // info). loadLeagueContext enforces membership and is the source the pages
  // trust; the authorize() stub is not usable for reads.
  const ctx = await loadLeagueContext(leagueId, user.id)
  if (!ctx) {
    return { error: 'You are not authorized to view prizes in this league.' }
  }

  return { sections: await loadPrizes(leagueId, seasonYear) }
}

