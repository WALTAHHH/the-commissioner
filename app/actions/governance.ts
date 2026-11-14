'use server'

/**
 * League governance — polls, binding votes, decisions, disputes.
 *
 * Hard rules enforced here:
 *  - Polls are isolated per league; each poll belongs to a single league.
 *  - Votes are limited to one per member per poll (unique index).
 *  - Poll results are calculated against thresholds; a binding poll that meets
 *    its threshold automatically creates a Decision record.
 *  - Disputes are league-specific and can be resolved by authorized members.
 */

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { authorize } from '@/src/lib/auth/authorize'
import { recordActivity } from '@/src/lib/activity'
import { POLL_TYPES, POLL_THRESHOLDS } from '@/src/db/schema/governance'
import type {
  PollType,
  PollStatus,
  PollThreshold,
  DisputeStatus,
} from '@/src/db/schema/governance'

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(str: string): boolean {
  return UUID_REGEX.test(str)
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Validate that a value is one of the allowed strings. */
function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && allowed.includes(value)
}

/** Validate that an array of strings has at least two distinct items. */
function validateOptions(options: unknown[]): { ok: true; texts: string[] } | { ok: false; error: string } {
  if (!Array.isArray(options) || options.length < 2) {
    return { ok: false, error: 'At least two options are required.' }
  }
  const texts: string[] = []
  for (const opt of options) {
    if (typeof opt !== 'string' || !opt.trim()) {
      return { ok: false, error: 'Each option must be a non-empty string.' }
    }
    if (opt.length > 500) {
      return { ok: false, error: 'Option text must be at most 500 characters.' }
    }
    texts.push(opt.trim())
  }
  // Ensure uniqueness? Allowing duplicates is okay; maybe enforce distinct.
  const distinct = new Set(texts)
  if (distinct.size < 2) {
    return { ok: false, error: 'Options must be distinct.' }
  }
  return { ok: true, texts }
}

// ----------------------------------------------------------------------------
// Result interfaces
// ----------------------------------------------------------------------------

export interface CreatePollResult {
  pollId?: string
  error?: string
}

export interface CastVoteResult {
  voteId?: string
  error?: string
}

export interface ClosePollResult {
  decisionId?: string
  error?: string
}

export interface PollView {
  id: string
  leagueId: string
  createdBy: string
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
  options: {
    id: string
    text: string
    displayOrder: number
    voteCount: number
  }[]
  totalVotes: number
  eligibleVoters: number
  userVoteOptionId: string | null
}

export interface GetPollsResult {
  polls?: PollView[]
  error?: string
}

export interface PollResult {
  pollId: string
  totalVotes: number
  optionResults: {
    optionId: string
    text: string
    voteCount: number
    percentage: number
  }[]
  threshold: PollThreshold
  customThreshold: number | null
  thresholdMet: boolean
  winningOptionId: string | null
}

export interface GetPollResultResult {
  result?: PollResult
  error?: string
}

export interface DecisionView {
  id: string
  leagueId: string
  pollId: string | null
  pollTitle: string | null
  title: string
  description: string
  outcome: string
  recordedBy: string
  recordedAt: string
}

export interface DisputeView {
  id: string
  leagueId: string
  raisedBy: string
  description: string
  status: DisputeStatus
  resolution: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface GetDecisionsResult {
  decisions?: DecisionView[]
  error?: string
}

export interface GetDisputesResult {
  disputes?: DisputeView[]
  error?: string
}

export interface CreateDisputeResult {
  disputeId?: string
  error?: string
}

export interface ResolveDisputeResult {
  disputeId?: string
  error?: string
}

// ----------------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------------

/**
 * Create a poll (informal or binding) with a set of options.
 *
 * @param leagueId uuid of the league
 * @param title poll title (1-200 chars)
 * @param description optional longer description
 * @param type 'informal' | 'binding'
 * @param threshold 'majority' | 'supermajority' | 'unanimous' | 'custom'
 * @param options array of option strings (at least two, each ≤500 chars)
 * @param customThreshold required when threshold === 'custom': the minimum
 *   number of votes the winning option must reach (absolute count, matching
 *   the tally logic in closePoll/getPollResult).
 * @param votingWindowHours optional hours until poll closes (default 72)
 */
export async function createPoll(
  leagueId: string,
  {
    title,
    description,
    type,
    threshold,
    customThreshold: customThresholdIn,
    options,
    votingWindowHours = 72,
  }: {
    title: string
    description?: string
    type: PollType
    threshold: PollThreshold
    customThreshold?: number
    options: string[]
    votingWindowHours?: number
  },
): Promise<CreatePollResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (typeof title !== 'string' || !title.trim()) {
    return { error: 'Title is required.' }
  }
  if (title.length > 200) {
    return { error: 'Title must be at most 200 characters.' }
  }
  if (description !== undefined && description.length > 2000) {
    return { error: 'Description must be at most 2000 characters.' }
  }
  if (!isOneOf(type, POLL_TYPES)) {
    return { error: 'Invalid poll type.' }
  }
  if (!isOneOf(threshold, POLL_THRESHOLDS)) {
    return { error: 'Invalid threshold.' }
  }
  // 'custom' requires an explicit minimum-vote target; other thresholds
  // never store one. Semantics: winning option must reach >= this many
  // votes — the same absolute count closePoll/getPollResult evaluate.
  let customThreshold: number | null = null
  if (threshold === 'custom') {
    if (
      typeof customThresholdIn !== 'number' ||
      !Number.isInteger(customThresholdIn) ||
      customThresholdIn < 1 ||
      customThresholdIn > 1000
    ) {
      return { error: 'A custom threshold requires an integer between 1 and 1000 votes.' }
    }
    customThreshold = customThresholdIn
  }
  const validatedOptions = validateOptions(options)
  if (!validatedOptions.ok) {
    return { error: validatedOptions.error }
  }
  if (!Number.isInteger(votingWindowHours) || votingWindowHours < 1 || votingWindowHours > 720) {
    return { error: 'Voting window must be between 1 and 720 hours.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'createPoll',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to create polls in this league.' }
  }

  // Insert poll row.
  const { data: pollData, error: pollError } = await db
    .from('polls')
    .insert({
      league_id: leagueId,
      created_by: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      type,
      status: 'open',
      threshold,
      custom_threshold: customThreshold,
      voting_window_hours: votingWindowHours,
      closes_at: new Date(Date.now() + votingWindowHours * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (pollError || !pollData) {
    console.error('createPoll insert error:', pollError)
    return { error: 'Failed to create poll.' }
  }

  const pollId = (pollData as unknown as { id: string }).id

  // Insert options.
  const optionRows = validatedOptions.texts.map((text, idx) => ({
    poll_id: pollId,
    text,
    display_order: idx,
  }))
  const { error: optionsError } = await db
    .from('poll_options')
    .insert(optionRows)

  if (optionsError) {
    console.error('createPoll options insert error:', optionsError)
    // PostgREST has no transaction over HTTP; compensate by deleting the
    // orphan poll so a failed create leaves no half-built poll behind.
    const { error: rollbackError } = await db.from('polls').delete().eq('id', pollId)
    if (rollbackError) {
      console.error('createPoll rollback error:', rollbackError)
    }
    return { error: 'Failed to create poll options.' }
  }

  await recordActivity(
    leagueId,
    user.id,
    'poll_created',
    `Poll created: “${title.trim()}”`,
    { pollId, type, threshold },
  )

  return { pollId }
}

/**
 * Cast a vote on an open poll.
 * Enforces one vote per member per poll (unique index will catch duplicates).
 *
 * @param pollId uuid of the poll
 * @param optionId uuid of the selected option
 */
export async function castVote(
  pollId: string,
  optionId: string,
): Promise<CastVoteResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(pollId) || !isUuid(optionId)) {
    return { error: 'Invalid poll or option ID.' }
  }

  // Fetch poll to verify it's open and belongs to a league.
  const { data: pollData, error: pollError } = await db
    .from('polls')
    .select('id, league_id, status, closes_at')
    .eq('id', pollId)
    .maybeSingle()

  if (pollError || !pollData) {
    return { error: 'Poll not found.' }
  }
  const poll = pollData as unknown as {
    id: string
    league_id: string
    status: string
    closes_at: string | null
  }
  if (poll.status !== 'open') {
    return { error: 'This poll is not open for voting.' }
  }
  // status only flips when closePoll runs; a poll past its window must not
  // accept votes even while the row still says 'open'.
  if (poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now()) {
    return { error: 'The voting window for this poll has ended.' }
  }

  // Verify option belongs to this poll.
  const { data: optionData, error: optionError } = await db
    .from('poll_options')
    .select('id')
    .eq('id', optionId)
    .eq('poll_id', pollId)
    .maybeSingle()

  if (optionError || !optionData) {
    return { error: 'Invalid option for this poll.' }
  }

  // Find the member id for this user in the league. Only ACTIVE
  // memberships may vote; removed/inactive members are rejected here even
  // though their auth user still exists.
  const { data: memberData, error: memberError } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', poll.league_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (memberError || !memberData) {
    return { error: 'You are not an active member of this league.' }
  }
  const memberId = (memberData as unknown as { id: string }).id

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId: poll.league_id,
    action: 'castVote',
    resourceId: pollId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to vote in this poll.' }
  }

  // Insert vote; unique index will prevent duplicate votes.
  const { data: voteData, error: voteError } = await db
    .from('poll_votes')
    .insert({
      poll_id: pollId,
      option_id: optionId,
      member_id: memberId,
    })
    .select('id')
    .single()

  if (voteError) {
    // Check if it's a unique violation (already voted).
    if ((voteError as any).code === '23505') {
      return { error: 'You have already voted in this poll.' }
    }
    console.error('castVote insert error:', voteError)
    return { error: 'Failed to cast vote.' }
  }

  const voteId = (voteData as unknown as { id: string }).id

  await recordActivity(
    poll.league_id,
    user.id,
    'vote_cast',
    `Vote cast in poll`,
    { pollId, optionId },
  )

  return { voteId }
}

/**
 * Close a poll, calculate results, and create a Decision record if binding threshold met.
 * Only authorized users (commissioner or poll creator) may close a poll.
 *
 * @param pollId uuid of the poll
 */
export async function closePoll(pollId: string): Promise<ClosePollResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(pollId)) {
    return { error: 'Invalid poll ID.' }
  }

  // Fetch poll with league and threshold info.
  const { data: pollData, error: pollError } = await db
    .from('polls')
    .select('id, league_id, created_by, title, type, threshold, custom_threshold, status')
    .eq('id', pollId)
    .maybeSingle()

  if (pollError || !pollData) {
    return { error: 'Poll not found.' }
  }
  const poll = pollData as unknown as {
    id: string
    league_id: string
    created_by: string
    title: string
    type: string
    threshold: string
    custom_threshold: number | null
    status: string
  }
  if (poll.status !== 'open') {
    return { error: 'Poll is already closed or cancelled.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId: poll.league_id,
    action: 'closePoll',
    resourceId: pollId,
  })
  if (!isAuthorized) {
    // Also allow poll creator to close.
    if (poll.created_by !== user.id) {
      return { error: 'You are not authorized to close this poll.' }
    }
  }

  // Calculate vote counts per option.
  const { data: votesData, error: votesError } = await db
    .from('poll_votes')
    .select('option_id')
    .eq('poll_id', pollId)

  if (votesError) {
    console.error('closePoll votes fetch error:', votesError)
    return { error: 'Failed to tally votes.' }
  }
  const votes = votesData as unknown as { option_id: string }[]
  const totalVotes = votes.length

  // Group counts.
  const optionCounts = new Map<string, number>()
  for (const v of votes) {
    optionCounts.set(v.option_id, (optionCounts.get(v.option_id) || 0) + 1)
  }

  // Determine winning option (highest count; ties remain unresolved?).
  let winningOptionId: string | null = null
  let maxVotes = 0
  for (const [optionId, count] of optionCounts) {
    if (count > maxVotes) {
      maxVotes = count
      winningOptionId = optionId
    } else if (count === maxVotes) {
      winningOptionId = null // tie, no single winner
    }
  }

  // Evaluate threshold.
  const threshold = poll.threshold as PollThreshold
  const customThreshold = poll.custom_threshold
  let thresholdMet = false
  if (totalVotes > 0) {
    switch (threshold) {
      case 'majority':
        thresholdMet = maxVotes > totalVotes / 2
        break
      case 'supermajority':
        thresholdMet = maxVotes > (totalVotes * 2) / 3
        break
      case 'unanimous':
        thresholdMet = maxVotes === totalVotes
        break
      case 'custom':
        thresholdMet = customThreshold !== null && maxVotes >= customThreshold
        break
    }
  }

  // Update poll status.
  const { error: updateError } = await db
    .from('polls')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
    })
    .eq('id', pollId)

  if (updateError) {
    console.error('closePoll update error:', updateError)
    return { error: 'Failed to close poll.' }
  }

  // If binding poll and threshold met, create a Decision record.
  let decisionId: string | undefined
  if (poll.type === 'binding' && thresholdMet && winningOptionId) {
    // Fetch winning option text.
    const { data: optionData, error: optionError } = await db
      .from('poll_options')
      .select('text')
      .eq('id', winningOptionId)
      .maybeSingle()

    if (optionError || !optionData) {
      // This should not happen.
      console.error('closePoll missing winning option:', winningOptionId)
    } else {
      const winningText = (optionData as unknown as { text: string }).text
      const { data: decisionData, error: decisionError } = await db
        .from('decisions')
        .insert({
          league_id: poll.league_id,
          poll_id: pollId,
          title: `Poll result: ${poll.title.trim().slice(0, 160)}`,
          description: `Binding poll passed threshold. Winning option: "${winningText}" with ${maxVotes} votes.`,
          outcome: 'passed',
          recorded_by: user.id,
        })
        .select('id')
        .single()

      if (decisionError || !decisionData) {
        console.error('closePoll decision insert error:', decisionError)
      } else {
        decisionId = (decisionData as unknown as { id: string }).id
      }
    }
  }

  await recordActivity(
    poll.league_id,
    user.id,
    'poll_closed',
    `Poll closed`,
    { pollId, totalVotes, thresholdMet },
  )

  return { decisionId }
}

/**
 * Get all polls for a league, with vote counts per option.
 *
 * @param leagueId uuid of the league
 */
export async function getPolls(leagueId: string): Promise<GetPollsResult> {
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
    action: 'viewPolls',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view polls in this league.' }
  }

  // Count eligible voters: only active memberships may vote.
  const { count: eligibleVoters, error: countError } = await db
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .eq('status', 'active')

  if (countError) {
    console.error('getPolls member count error:', countError)
    // proceed with eligibleVoters = 0; not fatal.
  }

  const eligibleVotersCount = eligibleVoters ?? 0

  // Find member id for the current user.
  const { data: memberData, error: memberError } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberError || !memberData) {
    // Not a member? Should not happen because authorization passed.
    // userVote will be null.
  }
  const memberId = memberData?.id

  // Fetch polls.
  const { data: pollsData, error: pollsError } = await db
    .from('polls')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })

  if (pollsError) {
    console.error('getPolls error:', pollsError)
    return { error: 'Failed to fetch polls.' }
  }
  const polls = pollsData as unknown as any[]

  if (polls.length === 0) {
    return { polls: [] }
  }

  const pollIds = polls.map(p => p.id)

  // Fetch user's votes for these polls (for highlighting).
  const userVotesMap = new Map<string, string>()
  if (memberId) {
    const { data: userVotesData, error: userVotesError } = await db
      .from('poll_votes')
      .select('poll_id, option_id')
      .eq('member_id', memberId)
      .in('poll_id', pollIds)

    if (!userVotesError && userVotesData) {
      for (const v of userVotesData as unknown as { poll_id: string, option_id: string }[]) {
        userVotesMap.set(v.poll_id, v.option_id)
      }
    }
  }

  // Fetch options for these polls.
  const { data: optionsData, error: optionsError } = await db
    .from('poll_options')
    .select('*')
    .in('poll_id', pollIds)

  if (optionsError) {
    console.error('getPolls options error:', optionsError)
    return { error: 'Failed to fetch poll options.' }
  }
  const options = optionsData as unknown as any[]

  // Fetch vote counts per option.
  const { data: votesData, error: votesError } = await db
    .from('poll_votes')
    .select('option_id')
    .in('poll_id', pollIds)

  if (votesError) {
    console.error('getPolls votes error:', votesError)
    return { error: 'Failed to fetch votes.' }
  }
  const votes = votesData as unknown as { option_id: string }[]

  const voteCounts = new Map<string, number>()
  for (const v of votes) {
    voteCounts.set(v.option_id, (voteCounts.get(v.option_id) || 0) + 1)
  }

  // Build option views.
  const optionsByPoll = new Map<string, any[]>()
  for (const opt of options) {
    const list = optionsByPoll.get(opt.poll_id) || []
    list.push({
      id: opt.id,
      text: opt.text,
      displayOrder: opt.display_order,
      voteCount: voteCounts.get(opt.id) || 0,
    })
    optionsByPoll.set(opt.poll_id, list)
  }

  // Build poll views.
  const pollViews: PollView[] = polls.map(p => {
    const pollOptions = optionsByPoll.get(p.id) || []
    const totalVotes = pollOptions.reduce((sum, o) => sum + o.voteCount, 0)
    return {
      id: p.id,
      leagueId: p.league_id,
      createdBy: p.created_by,
      title: p.title,
      description: p.description,
      type: p.type,
      status: p.status,
      threshold: p.threshold,
      customThreshold: p.custom_threshold,
      votingWindowHours: p.voting_window_hours,
      createdAt: p.created_at,
      closesAt: p.closes_at,
      closedAt: p.closed_at,
      options: pollOptions.sort((a, b) => a.displayOrder - b.displayOrder),
      totalVotes,
      eligibleVoters: eligibleVotersCount,
      userVoteOptionId: userVotesMap.get(p.id) ?? null,
    }
  })

  return { polls: pollViews }
}

/**
 * Get detailed result of a single poll.
 *
 * @param pollId uuid of the poll
 */
export async function getPollResult(pollId: string): Promise<GetPollResultResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(pollId)) {
    return { error: 'Invalid poll ID.' }
  }

  // Fetch poll.
  const { data: pollData, error: pollError } = await db
    .from('polls')
    .select('*')
    .eq('id', pollId)
    .maybeSingle()

  if (pollError || !pollData) {
    return { error: 'Poll not found.' }
  }
  const poll = pollData as unknown as any

  // Determine league for authorization.
  const leagueId = poll.league_id
  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'viewPolls',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view this poll.' }
  }

  // Fetch options.
  const { data: optionsData, error: optionsError } = await db
    .from('poll_options')
    .select('*')
    .eq('poll_id', pollId)
    .order('display_order')

  if (optionsError) {
    console.error('getPollResult options error:', optionsError)
    return { error: 'Failed to fetch poll options.' }
  }
  const options = optionsData as unknown as any[]

  // Fetch votes.
  const { data: votesData, error: votesError } = await db
    .from('poll_votes')
    .select('option_id')
    .eq('poll_id', pollId)

  if (votesError) {
    console.error('getPollResult votes error:', votesError)
    return { error: 'Failed to fetch votes.' }
  }
  const votes = votesData as unknown as { option_id: string }[]
  const totalVotes = votes.length

  // Count per option.
  const optionCounts = new Map<string, number>()
  for (const v of votes) {
    optionCounts.set(v.option_id, (optionCounts.get(v.option_id) || 0) + 1)
  }

  // Build option results.
  const optionResults = options.map(opt => {
    const voteCount = optionCounts.get(opt.id) || 0
    const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0
    return {
      optionId: opt.id,
      text: opt.text,
      voteCount,
      percentage,
    }
  })

  // Determine winning option (highest vote count; tie => null).
  let winningOptionId: string | null = null
  let maxVotes = 0
  for (const [optionId, count] of optionCounts) {
    if (count > maxVotes) {
      maxVotes = count
      winningOptionId = optionId
    } else if (count === maxVotes) {
      winningOptionId = null // tie
    }
  }

  // Evaluate threshold.
  const threshold = poll.threshold as PollThreshold
  const customThreshold = poll.custom_threshold
  let thresholdMet = false
  if (totalVotes > 0) {
    switch (threshold) {
      case 'majority':
        thresholdMet = maxVotes > totalVotes / 2
        break
      case 'supermajority':
        thresholdMet = maxVotes > (totalVotes * 2) / 3
        break
      case 'unanimous':
        thresholdMet = maxVotes === totalVotes
        break
      case 'custom':
        thresholdMet = customThreshold !== null && maxVotes >= customThreshold
        break
    }
  }

  const result: PollResult = {
    pollId,
    totalVotes,
    optionResults,
    threshold,
    customThreshold,
    thresholdMet,
    winningOptionId,
  }

  return { result }
}

/**
 * Raise a dispute within a league.
 *
 * @param leagueId uuid of the league
 * @param description description of the dispute
 */
export async function createDispute(
  leagueId: string,
  { description }: { description: string },
): Promise<CreateDisputeResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (typeof description !== 'string' || !description.trim()) {
    return { error: 'Description is required.' }
  }
  if (description.length > 5000) {
    return { error: 'Description must be at most 5000 characters.' }
  }

  // Find member id for this user in the league (active memberships only).
  const { data: memberData, error: memberError } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (memberError || !memberData) {
    return { error: 'You are not an active member of this league.' }
  }
  const memberId = (memberData as unknown as { id: string }).id

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'createDispute',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to raise a dispute in this league.' }
  }

  const { data: disputeData, error: disputeError } = await db
    .from('disputes')
    .insert({
      league_id: leagueId,
      raised_by: memberId,
      description: description.trim(),
      status: 'open',
    })
    .select('id')
    .single()

  if (disputeError || !disputeData) {
    console.error('createDispute insert error:', disputeError)
    return { error: 'Failed to create dispute.' }
  }

  const disputeId = (disputeData as unknown as { id: string }).id

  await recordActivity(
    leagueId,
    user.id,
    'dispute_raised',
    `Dispute raised: ${description.trim().slice(0, 100)}…`,
    { disputeId },
  )

  return { disputeId }
}

/**
 * Resolve an open dispute.
 *
 * @param disputeId uuid of the dispute
 * @param resolution resolution text
 */
export async function resolveDispute(
  disputeId: string,
  { resolution }: { resolution: string },
): Promise<ResolveDisputeResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(disputeId)) {
    return { error: 'Invalid dispute ID.' }
  }
  if (typeof resolution !== 'string' || !resolution.trim()) {
    return { error: 'Resolution is required.' }
  }
  if (resolution.length > 5000) {
    return { error: 'Resolution must be at most 5000 characters.' }
  }

  // Fetch dispute to get league and ensure it's open.
  const { data: disputeData, error: disputeError } = await db
    .from('disputes')
    .select('id, league_id, status')
    .eq('id', disputeId)
    .maybeSingle()

  if (disputeError || !disputeData) {
    return { error: 'Dispute not found.' }
  }
  const dispute = disputeData as unknown as { id: string; league_id: string; status: string }
  if (dispute.status !== 'open') {
    return { error: 'Dispute is already resolved.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId: dispute.league_id,
    action: 'resolveDispute',
    resourceId: disputeId,
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to resolve this dispute.' }
  }

  const { error: updateError } = await db
    .from('disputes')
    .update({
      status: 'resolved',
      resolution: resolution.trim(),
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', disputeId)

  if (updateError) {
    console.error('resolveDispute update error:', updateError)
    return { error: 'Failed to resolve dispute.' }
  }

  await recordActivity(
    dispute.league_id,
    user.id,
    'dispute_resolved',
    `Dispute resolved`,
    { disputeId },
  )

  return { disputeId }
}

// ----------------------------------------------------------------------------
// Decisions (standalone record + list) and dispute list
// ----------------------------------------------------------------------------

export interface RecordDecisionResult {
  decisionId?: string
  error?: string
}

/**
 * Record a standalone decision (commissioner CTA — not poll-closure-generated).
 *
 * @param leagueId uuid of the league
 * @param title decision title
 * @param description longer description
 * @param outcome what was decided / the effect
 * @param pollId optional poll this decision stems from
 */
export async function recordDecision(
  leagueId: string,
  {
    title,
    description,
    outcome,
    pollId,
  }: {
    title: string
    description: string
    outcome: string
    pollId?: string
  },
): Promise<RecordDecisionResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (typeof title !== 'string' || !title.trim()) {
    return { error: 'Title is required.' }
  }
  if (title.length > 200) {
    return { error: 'Title must be at most 200 characters.' }
  }
  if (typeof description !== 'string' || !description.trim()) {
    return { error: 'Description is required.' }
  }
  if (description.length > 5000) {
    return { error: 'Description must be at most 5000 characters.' }
  }
  if (typeof outcome !== 'string' || !outcome.trim()) {
    return { error: 'Outcome is required.' }
  }
  if (outcome.length > 500) {
    return { error: 'Outcome must be at most 500 characters.' }
  }
  if (pollId !== undefined && !isUuid(pollId)) {
    return { error: 'Invalid poll ID.' }
  }

  // Linked poll, if any, must belong to this league (cross-league guard).
  if (pollId) {
    const { data: pollRow } = await db
      .from('polls')
      .select('id, league_id')
      .eq('id', pollId)
      .maybeSingle()
    if (!pollRow || (pollRow as unknown as { league_id: string }).league_id !== leagueId) {
      return { error: 'Linked poll not found in this league.' }
    }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'recordDecision',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to record decisions in this league.' }
  }

  const { data: decisionData, error: decisionError } = await db
    .from('decisions')
    .insert({
      league_id: leagueId,
      poll_id: pollId ?? null,
      title: title.trim(),
      description: description.trim(),
      outcome: outcome.trim(),
      recorded_by: user.id,
    })
    .select('id')
    .single()

  if (decisionError || !decisionData) {
    console.error('recordDecision insert error:', decisionError)
    return { error: 'Failed to record decision.' }
  }

  const decisionId = (decisionData as unknown as { id: string }).id

  await recordActivity(
    leagueId,
    user.id,
    'decision_recorded',
    `Decision recorded: “${title.trim()}”`,
    { decisionId, pollId: pollId ?? null },
  )

  return { decisionId }
}

/**
 * List decisions for a league, newest first, with linked poll title.
 *
 * @param leagueId uuid of the league
 */
export async function getDecisions(leagueId: string): Promise<GetDecisionsResult> {
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
    action: 'viewDecisions',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view decisions in this league.' }
  }

  const { data, error } = await db
    .from('decisions')
    .select('*, polls(title)')
    .eq('league_id', leagueId)
    .order('recorded_at', { ascending: false })

  if (error) {
    console.error('getDecisions error:', error)
    return { error: 'Failed to fetch decisions.' }
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string
    league_id: string
    poll_id: string | null
    title: string
    description: string
    outcome: string
    recorded_by: string
    recorded_at: string
    polls: { title: string } | { title: string }[] | null
  }>

  const decisionsOut: DecisionView[] = rows.map((r) => {
    const linked = Array.isArray(r.polls) ? r.polls[0] : r.polls
    return {
      id: r.id,
      leagueId: r.league_id,
      pollId: r.poll_id,
      pollTitle: linked?.title ?? null,
      title: r.title,
      description: r.description,
      outcome: r.outcome,
      recordedBy: r.recorded_by,
      recordedAt: r.recorded_at,
    }
  })

  return { decisions: decisionsOut }
}

/**
 * List disputes for a league (open + resolved), newest first.
 *
 * @param leagueId uuid of the league
 */
export async function getDisputes(leagueId: string): Promise<GetDisputesResult> {
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
    action: 'viewDisputes',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view disputes in this league.' }
  }

  const { data, error } = await db
    .from('disputes')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getDisputes error:', error)
    return { error: 'Failed to fetch disputes.' }
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string
    league_id: string
    raised_by: string
    description: string
    status: string
    resolution: string | null
    resolved_by: string | null
    resolved_at: string | null
    created_at: string
  }>

  const disputesOut: DisputeView[] = rows.map((r) => ({
    id: r.id,
    leagueId: r.league_id,
    raisedBy: r.raised_by,
    description: r.description,
    status: r.status as DisputeStatus,
    resolution: r.resolution,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  }))

  return { disputes: disputesOut }
}