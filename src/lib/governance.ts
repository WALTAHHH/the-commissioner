/**
 * Read queries backing the governance pages (Governance-2).
 *
 * Server-only — never import from a client component. Same architecture as
 * `src/lib/finances.ts` and `src/lib/rules.ts`: reads go through the
 * service-role client in `src/lib/db.ts` and page access is gated by
 * `loadLeagueContext`, because the `authorize()` stub currently denies every
 * action-layer call (including the read actions merged with Governance-1).
 * Writes stay in `app/actions/governance.ts` — that is the authorization
 * contract the permission-model workstream will honour, and the pages call it
 * directly. The action-layer *read* functions (`getPolls`, `getDecisions`,
 * `getDisputes`) stay exported for the same reason the finance ones do; this
 * layer exists so the pages render real data today instead of an
 * authorization error.
 *
 * Column names are the raw database names (`league_id`, `closes_at`) —
 * PostgREST has no ORM translation. Row shapes live in `src/db/rows.ts` and
 * everything is mapped to camelCase at this boundary.
 *
 * Turnout/threshold math mirrors `closePoll()` in the action layer exactly so
 * the number the UI shows for a closed poll is the number that decided the
 * stored Decision row.
 */

import { db } from '@/src/lib/db'
import { fetchIdentities } from '@/src/lib/dashboard'
import { displayName } from '@/src/lib/display'
import type {
  DecisionRow,
  DisputeRow,
  LeagueMemberRow,
  PollOptionRow,
  PollRow,
  PollVoteRow,
  UserIdentityRow,
} from '@/src/db/rows'
import {
  DISPUTE_STATUSES,
  POLL_STATUSES,
  POLL_THRESHOLDS,
  POLL_TYPES,
  type DisputeStatus,
  type PollStatus,
  type PollThreshold,
  type PollType,
} from '@/src/db/schema/governance'

const UNKNOWN_MEMBER = 'Unknown member'

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type PollOptionView = {
  id: string
  text: string
  displayOrder: number
  voteCount: number
}

export type PollView = {
  id: string
  leagueId: string
  createdBy: string
  createdByName: string
  title: string
  description: string | null
  type: PollType
  status: PollStatus
  threshold: PollThreshold
  customThreshold: number | null
  votingWindowHours: number
  createdAt: string
  closesAt: string | null
  closedAt: string | null
  options: PollOptionView[]
  totalVotes: number
  /** League membership size — the turnout denominator. */
  eligibleVoters: number
  /** The viewer's membership row id, when they voted in this poll. */
  userVoteMemberId: string | null
  /** Option id the viewer chose, or null (not voted / not a member). */
  userVoteOptionId: string | null
}

/** A closed poll's outcome, derived from its stored votes. */
export type PollOutcomeView = {
  totalVotes: number
  leadingVoteCount: number
  winningOption: PollOptionView | null
  /** True when two or more options tie on the top count. */
  isTie: boolean
  thresholdMet: boolean
  /** Human-readable form of the rule that was applied, e.g. 'Majority (>50%)'. */
  thresholdLabel: string
  turnoutPct: number | null
}

export type DecisionView = {
  id: string
  leagueId: string
  pollId: string | null
  pollTitle: string | null
  title: string
  description: string
  outcome: string
  recordedBy: string
  recordedByName: string
  recordedAt: string
}

export type DisputeView = {
  id: string
  leagueId: string
  raisedBy: string
  raisedByName: string
  description: string
  status: DisputeStatus
  resolution: string | null
  resolvedBy: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  createdAt: string
}

export type PollOptionChoice = { id: string; title: string }

export type GovernanceHubView = {
  openPolls: PollView[]
  closedPolls: PollView[]
  /** Decision rows newest-first, capped by the caller. */
  decisions: DecisionView[]
  disputes: DisputeView[]
  /** Polls the "link a poll" picker may offer (open + closed, never cancelled). */
  pollChoices: PollOptionChoice[]
  eligibleVoters: number
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function normalizePollType(value: string): PollType {
  return (POLL_TYPES as readonly string[]).includes(value)
    ? (value as PollType)
    : 'informal'
}

function normalizePollStatus(value: string): PollStatus {
  return (POLL_STATUSES as readonly string[]).includes(value)
    ? (value as PollStatus)
    : 'open'
}

function normalizeThreshold(value: string): PollThreshold {
  return (POLL_THRESHOLDS as readonly string[]).includes(value)
    ? (value as PollThreshold)
    : 'majority'
}

function normalizeDisputeStatus(value: string): DisputeStatus {
  return (DISPUTE_STATUSES as readonly string[]).includes(value)
    ? (value as DisputeStatus)
    : 'open'
}

function nameFor(
  identities: Map<string, UserIdentityRow>,
  userId: string | null,
): string {
  if (!userId) return UNKNOWN_MEMBER
  const identity = identities.get(userId)
  return identity ? displayName(identity) : UNKNOWN_MEMBER
}

/**
 * member id -> display label. Mirrors `src/lib/finances.ts`: the linked
 * user's display name, else the team name, else 'Unknown member'.
 */
async function loadMemberNames(
  leagueId: string,
  memberIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = Array.from(new Set(memberIds.filter(Boolean)))
  if (unique.length === 0) return out

  const { data, error } = await db
    .from('league_members')
    .select('id, league_id, user_id, role, team_name, status, joined_at')
    .eq('league_id', leagueId)
    .in('id', unique)
  if (error) {
    console.error('governance members lookup error:', error)
    return out // non-fatal: rows still render with fallback names
  }
  const rows = (data ?? []) as unknown as LeagueMemberRow[]
  const identities = await fetchIdentities(
    rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)),
  )
  for (const row of rows) {
    out.set(
      row.id,
      row.user_id ? nameFor(identities, row.user_id) : row.team_name ?? UNKNOWN_MEMBER,
    )
  }
  return out
}

/** League membership size, active rows only — the same denominator countActiveMembers uses. */
async function loadEligibleVoterCount(leagueId: string): Promise<number> {
  const { count, error } = await db
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .eq('status', 'active')
  if (error) console.error('governance eligible-voter count error:', error)
  return count ?? 0
}

type RawOption = { id: string; poll_id: string; text: string; display_order: number }
type RawVote = { poll_id: string; option_id: string; member_id: string }

/**
 * Attach vote counts to each option and compute per-poll totals.
 * Options arrive for many polls at once and are bucketed here so the caller
 * issues three queries regardless of poll count.
 */
function buildPollViews(
  polls: PollRow[],
  options: RawOption[],
  votes: RawVote[],
  viewerMembershipId: string | null,
  eligibleVoters: number,
  identities: Map<string, UserIdentityRow>,
): PollView[] {
  const counts = new Map<string, number>()
  for (const vote of votes) {
    counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1)
  }
  const viewerVoteByPoll = new Map<string, string>()
  if (viewerMembershipId) {
    for (const vote of votes) {
      if (vote.member_id === viewerMembershipId) {
        viewerVoteByPoll.set(vote.poll_id, vote.option_id)
      }
    }
  }

  const optionsByPoll = new Map<string, PollOptionView[]>()
  for (const option of options) {
    const list = optionsByPoll.get(option.poll_id) ?? []
    list.push({
      id: option.id,
      text: option.text,
      displayOrder: option.display_order,
      voteCount: counts.get(option.id) ?? 0,
    })
    optionsByPoll.set(option.poll_id, list)
  }

  return polls.map((poll) => {
    const pollOptions = (optionsByPoll.get(poll.id) ?? []).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    )
    const totalVotes = pollOptions.reduce((sum, o) => sum + o.voteCount, 0)
    const userVoteOptionId = viewerVoteByPoll.get(poll.id) ?? null
    return {
      id: poll.id,
      leagueId: poll.league_id,
      createdBy: poll.created_by,
      createdByName: nameFor(identities, poll.created_by),
      title: poll.title,
      description: poll.description,
      type: normalizePollType(poll.type),
      status: normalizePollStatus(poll.status),
      threshold: normalizeThreshold(poll.threshold),
      customThreshold: poll.custom_threshold,
      votingWindowHours: poll.voting_window_hours,
      createdAt: poll.created_at,
      closesAt: poll.closes_at,
      closedAt: poll.closed_at,
      options: pollOptions,
      totalVotes,
      eligibleVoters,
      userVoteMemberId: viewerMembershipId,
      userVoteOptionId,
    }
  })
}

export function thresholdLabelFor(
  threshold: PollThreshold,
  customThreshold: number | null,
): string {
  switch (threshold) {
    case 'majority':
      return 'Majority (>50% of votes)'
    case 'supermajority':
      return 'Supermajority (>⅔ of votes)'
    case 'unanimous':
      return 'Unanimous (all votes)'
    case 'custom':
      return customThreshold === null
        ? 'Custom (no number recorded)'
        : `Custom (≥${customThreshold} votes)`
  }
}

/**
 * Outcome of a closed poll.
 *
 * Deliberately re-implements `closePoll()`'s arithmetic rather than storing a
 * verdict: `polls` has no result column, so the stored Decision row and this
 * view must agree by construction. `thresholdMet` is measured against votes
 * *cast* (not membership) — the same denominator `closePoll` uses. A poll with
 * no votes never meets its threshold, and a tie has no winner.
 */
export function computeOutcome(poll: PollView): PollOutcomeView {
  const counts = poll.options.map((o) => o.voteCount)
  const leadingVoteCount = counts.length ? Math.max(...counts) : 0
  const onTop = poll.options.filter((o) => o.voteCount === leadingVoteCount)
  const isTie = leadingVoteCount > 0 && onTop.length > 1
  const winningOption = isTie ? null : (onTop[0] ?? null)
  const totalVotes = poll.totalVotes

  let thresholdMet = false
  if (totalVotes > 0 && leadingVoteCount > 0) {
    switch (poll.threshold) {
      case 'majority':
        thresholdMet = leadingVoteCount > totalVotes / 2
        break
      case 'supermajority':
        thresholdMet = leadingVoteCount > (totalVotes * 2) / 3
        break
      case 'unanimous':
        thresholdMet = leadingVoteCount === totalVotes
        break
      case 'custom':
        thresholdMet =
          poll.customThreshold !== null && leadingVoteCount >= poll.customThreshold
        break
    }
  }

  return {
    totalVotes,
    leadingVoteCount,
    winningOption,
    isTie,
    thresholdMet,
    thresholdLabel: thresholdLabelFor(poll.threshold, poll.customThreshold),
    turnoutPct:
      poll.eligibleVoters > 0
        ? Math.round((totalVotes / poll.eligibleVoters) * 100)
        : null,
  }
}

export function isPollExpired(poll: Pick<PollView, 'status' | 'closesAt'>, now = Date.now()): boolean {
  if (poll.status !== 'open' || !poll.closesAt) return false
  const closes = new Date(poll.closesAt).getTime()
  return Number.isFinite(closes) && closes <= now
}

// ---------------------------------------------------------------------------
// Loads
// ---------------------------------------------------------------------------

/**
 * Everything the governance hub shows: open + closed polls, recent decisions,
 * disputes, and the poll list for the record-decision picker.
 *
 * `viewerMembershipId` is the viewer's `league_members.id` (null for the
 * commissioner-but-not-member corner case) — it is what makes "your vote"
 * highlighting possible without a per-poll query.
 */
export async function loadGovernanceHub(
  leagueId: string,
  viewerMembershipId: string | null,
  options: { decisionLimit?: number } = {},
): Promise<GovernanceHubView> {
  const decisionLimit = options.decisionLimit ?? 5

  // Count membership once up front and hand the denominator to loadPolls;
  // two concurrent aggregates on the same table would be the same answer.
  const eligibleVoters = await loadEligibleVoterCount(leagueId)
  const polls = await loadPolls(leagueId, viewerMembershipId, eligibleVoters)

  const [{ decisions, pollChoices }, disputes] = await Promise.all([
    loadDecisionViews(leagueId, decisionLimit),
    loadDisputes(leagueId),
  ])

  return {
    openPolls: polls.filter((p) => p.status === 'open'),
    closedPolls: polls.filter((p) => p.status !== 'open'),
    decisions,
    disputes,
    pollChoices,
    eligibleVoters,
  }
}

/**
 * All non-cancelled polls with options, counts and the viewer's own vote.
 * `eligibleVotersOverride` lets a caller that already counted membership
 * (the hub) avoid a second aggregate query.
 */
export async function loadPolls(
  leagueId: string,
  viewerMembershipId: string | null,
  eligibleVotersOverride?: number,
): Promise<PollView[]> {
  const { data: pollData, error: pollError } = await db
    .from('polls')
    .select(
      'id, league_id, created_by, title, description, type, status, threshold, custom_threshold, voting_window_hours, created_at, closes_at, closed_at',
    )
    .eq('league_id', leagueId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  if (pollError) {
    console.error('loadPolls error:', pollError)
    return []
  }
  const polls = (pollData ?? []) as unknown as PollRow[]
  if (polls.length === 0) return []

  const pollIds = polls.map((p) => p.id)

  const [optionsResult, votesResult] = await Promise.all([
    db
      .from('poll_options')
      .select('id, poll_id, text, display_order')
      .in('poll_id', pollIds),
    db.from('poll_votes').select('poll_id, option_id, member_id').in('poll_id', pollIds),
  ])

  if (optionsResult.error) console.error('loadPolls options error:', optionsResult.error)
  if (votesResult.error) console.error('loadPolls votes error:', votesResult.error)

  const eligibleVoters =
    eligibleVotersOverride ?? (await loadEligibleVoterCount(leagueId))
  const identities = await fetchIdentities(polls.map((p) => p.created_by))

  return buildPollViews(
    polls,
    (optionsResult.data ?? []) as unknown as RawOption[],
    (votesResult.data ?? []) as unknown as RawVote[],
    viewerMembershipId,
    eligibleVoters,
    identities,
  )
}

/** A single poll, or null when it does not exist / belongs to another league. */
export async function loadPollDetail(
  leagueId: string,
  pollId: string,
  viewerMembershipId: string | null,
): Promise<PollView | null> {
  const { data: pollData, error: pollError } = await db
    .from('polls')
    .select(
      'id, league_id, created_by, title, description, type, status, threshold, custom_threshold, voting_window_hours, created_at, closes_at, closed_at',
    )
    .eq('id', pollId)
    .maybeSingle()

  if (pollError) console.error('loadPollDetail error:', pollError)
  // Cross-league guard: a poll id from another league must not render here.
  const raw = pollData as unknown as PollRow | null
  if (!raw || raw.league_id !== leagueId) return null

  const [optionsResult, votesResult, eligibleVoters, identities] = await Promise.all([
    db
      .from('poll_options')
      .select('id, poll_id, text, display_order')
      .eq('poll_id', pollId)
      .order('display_order', { ascending: true }),
    db.from('poll_votes').select('poll_id, option_id, member_id').eq('poll_id', pollId),
    loadEligibleVoterCount(leagueId),
    fetchIdentities([raw.created_by]),
  ])

  if (optionsResult.error) console.error('loadPollDetail options error:', optionsResult.error)
  if (votesResult.error) console.error('loadPollDetail votes error:', votesResult.error)

  const [view] = buildPollViews(
    [raw],
    (optionsResult.data ?? []) as unknown as RawOption[],
    (votesResult.data ?? []) as unknown as RawVote[],
    viewerMembershipId,
    eligibleVoters,
    identities,
  )
  return view ?? null
}

/**
 * Decision log, newest first, with the linked poll's title.
 *
 * `limit` caps the hub's "recent decisions" block; the log page passes
 * nothing and gets the whole chronology.
 */
export async function loadDecisions(
  leagueId: string,
  limit?: number,
): Promise<DecisionView[]> {
  const { decisions } = await loadDecisionViews(leagueId, limit)
  return decisions
}

async function loadDecisionViews(
  leagueId: string,
  limit?: number,
): Promise<{ decisions: DecisionView[]; pollChoices: PollOptionChoice[] }> {
  const { data, error } = await db
    .from('decisions')
    .select('id, league_id, poll_id, title, description, outcome, recorded_by, recorded_at')
    .eq('league_id', leagueId)
    .order('recorded_at', { ascending: false })

  if (error) {
    console.error('loadDecisions error:', error)
    return { decisions: [], pollChoices: [] }
  }

  const rows = (data ?? []) as unknown as DecisionRow[]
  const pollIds = Array.from(
    new Set(rows.map((r) => r.poll_id).filter((id): id is string => Boolean(id))),
  )

  let titleByPoll = new Map<string, string>()
  if (pollIds.length > 0) {
    const { data: pollRows, error: pollError } = await db
      .from('polls')
      .select('id, title')
      .in('id', pollIds)
    if (pollError) console.error('loadDecisions poll-title error:', pollError)
    titleByPoll = new Map(
      ((pollRows ?? []) as unknown as { id: string; title: string }[]).map((p) => [
        p.id,
        p.title,
      ]),
    )
  }

  const identities = await fetchIdentities(rows.map((r) => r.recorded_by))

  return {
    decisions: (limit === undefined ? rows : rows.slice(0, limit)).map((row) => ({
      id: row.id,
      leagueId: row.league_id,
      pollId: row.poll_id,
      pollTitle: row.poll_id ? (titleByPoll.get(row.poll_id) ?? null) : null,
      title: row.title,
      description: row.description,
      outcome: row.outcome,
      recordedBy: row.recorded_by,
      recordedByName: nameFor(identities, row.recorded_by),
      recordedAt: row.recorded_at,
    })),
    pollChoices: await loadPollChoices(leagueId),
  }
}

/** Disputes, newest first inside each status bucket (open listed first by callers). */
export async function loadDisputes(leagueId: string): Promise<DisputeView[]> {
  const { data, error } = await db
    .from('disputes')
    .select(
      'id, league_id, raised_by, description, status, resolution, resolved_by, resolved_at, created_at',
    )
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('loadDisputes error:', error)
    return []
  }
  const rows = (data ?? []) as unknown as DisputeRow[]
  if (rows.length === 0) return []

  const [memberNames, identities] = await Promise.all([
    loadMemberNames(
      leagueId,
      rows.map((r) => r.raised_by),
    ),
    fetchIdentities(
      rows.map((r) => r.resolved_by).filter((id): id is string => Boolean(id)),
    ),
  ])

  const views = rows.map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    raisedBy: row.raised_by,
    raisedByName: memberNames.get(row.raised_by) ?? UNKNOWN_MEMBER,
    description: row.description,
    status: normalizeDisputeStatus(row.status),
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolved_by ? nameFor(identities, row.resolved_by) : null,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }))

  // Open disputes are the actionable set, so they lead regardless of date.
  return [...views.filter((v) => v.status === 'open'), ...views.filter((v) => v.status !== 'open')]
}

/**
 * The Decision row a closed poll generated, if any.
 *
 * `closePoll` only inserts one for a binding poll whose threshold was met,
 * so null here means "no verdict was recorded", not "the query failed".
 */
export async function loadLinkedDecisionId(leagueId: string, pollId: string): Promise<string | null> {
  const { data, error } = await db
    .from('decisions')
    .select('id')
    .eq('league_id', leagueId)
    .eq('poll_id', pollId)
    .order('recorded_at', { ascending: false })
    .limit(1)
  if (error) console.error('loadLinkedDecisionId error:', error)
  const rows = (data ?? []) as unknown as { id: string }[]
  return rows[0]?.id ?? null
}

/**
 * Poll picker options for the record-decision form: every poll the league has
 * ever run except cancelled ones, newest first. Uncapped on purpose — linking
 * a decision to an older poll is a normal thing to want to do.
 */
export async function loadPollChoices(leagueId: string): Promise<PollOptionChoice[]> {
  const { data, error } = await db
    .from('polls')
    .select('id, title')
    .eq('league_id', leagueId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('loadPollChoices error:', error)
    return []
  }
  return ((data ?? []) as unknown as { id: string; title: string }[]).map((p) => ({
    id: p.id,
    title: p.title,
  }))
}

/**
 * Polls a member may still vote in — used by the hub's "needs your vote"
 * strip. Expired-but-unclosed polls are excluded client-side by
 * `isPollExpired`, since nothing mutates status on the clock.
 */
export function pollsNeedingVote(polls: PollView[]): PollView[] {
  return polls.filter(
    (p) => p.status === 'open' && !p.userVoteOptionId && !isPollExpired(p),
  )
}
