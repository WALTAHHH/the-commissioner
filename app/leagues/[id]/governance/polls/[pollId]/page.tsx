import { createClient } from '@/src/utils/supabase/server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, CalendarClock, Gavel, Scale, Users } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadMembershipId } from '@/src/lib/finances'
import {
  computeOutcome,
  isPollExpired,
  loadLinkedDecisionId,
  loadPollDetail,
} from '@/src/lib/governance'
import { formatDate, formatPercentage, pluralizeCount } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import ClosePollButton from '../close-poll-button'
import PollVotePanel from '../poll-vote-panel'
import PollCountdown, { initialCountdownLabel } from '../../poll-countdown'
import {
  OutcomeBadge,
  PollStatusBadge,
  PollTypeBadge,
  ThresholdBadge,
} from '../../governance-badges'

export const dynamic = 'force-dynamic'

/**
 * Poll detail (Governance-2).
 *
 * Open poll: the ballot is the page — tap an option to vote, your own choice
 * stays highlighted, and the commissioner can close it early. Closed poll:
 * the outcome is the page — winner, counts, turnout, and whether the
 * threshold was actually met, plus the decision `closePoll` recorded when a
 * binding poll passed.
 *
 * The result math is re-derived from the stored ballots here rather than
 * trusted from a client, using the same rule set `closePoll` applies, so the
 * verdict shown is the verdict that was written.
 */
export default async function PollDetailPage({
  params,
}: {
  params: Promise<{ id: string; pollId: string }>
}) {
  const { id, pollId } = await params
  if (!isUuid(id) || !isUuid(pollId)) notFound()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const membershipId = await loadMembershipId(id, user.id)
  const poll = await loadPollDetail(id, pollId, membershipId)
  if (!poll) notFound()

  const expired = isPollExpired(poll)
  const isClosed = poll.status !== 'open'
  // A commissioner who never joined league_members has no ballot to cast;
  // the action layer will refuse it, so the UI must not offer it.
  const votable = poll.status === 'open' && !expired && membershipId !== null
  const outcome = isClosed ? computeOutcome(poll) : null
  const linkedDecisionId = isClosed ? await loadLinkedDecisionId(id, poll.id) : null
  const userChoice = poll.options.find((o) => o.id === poll.userVoteOptionId)

  return (
    <div className="space-y-6">
      <Link
        href={`/leagues/${id}/governance`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Governance
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {poll.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {ctx.name} · started by {poll.createdByName}{' '}
              {formatDate(new Date(poll.createdAt))}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <PollStatusBadge status={poll.status} expired={expired} />
            <PollTypeBadge type={poll.type} />
          </div>
        </div>

        {poll.description && (
          <p className="whitespace-pre-line rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {poll.description}
          </p>
        )}
      </div>

      {/* Meta strip */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold tabular-nums text-foreground">
              {pluralizeCount(poll.totalVotes, 'vote')}
            </span>
            {poll.eligibleVoters > 0 && (
              <>
                {' from '}
                <span className="tabular-nums text-foreground">
                  {formatPercentage(poll.totalVotes, poll.eligibleVoters)}
                </span>
                {` of ${poll.eligibleVoters} members`}
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {poll.status === 'open' && poll.closesAt ? (
            <PollCountdown
              closesAt={poll.closesAt}
              initialLabel={initialCountdownLabel(poll.closesAt)}
            />
          ) : poll.closedAt ? (
            <span>Closed {formatDate(new Date(poll.closedAt))}</span>
          ) : (
            <span>No close date</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Scale className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{outcome?.thresholdLabel ?? 'To be decided'}</span>
        </div>
      </div>

      {/* Outcome banner (closed polls only) */}
      {isClosed && outcome && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Result</h2>
            <OutcomeBadge passed={outcome.thresholdMet} isTie={outcome.isTie} />
          </div>

          {outcome.winningOption ? (
            <p className="mt-3 text-sm text-foreground">
              <span className="font-semibold">{outcome.winningOption.text}</span>{' '}
              led with{' '}
              {pluralizeCount(outcome.leadingVoteCount, 'vote')} (
              {formatPercentage(outcome.leadingVoteCount, outcome.totalVotes)} of votes
              cast).
            </p>
          ) : outcome.isTie ? (
            <p className="mt-3 text-sm text-foreground">
              Tie at {pluralizeCount(outcome.leadingVoteCount, 'vote')} — no option won,
              so no result was recorded.
            </p>
          ) : (
            <p className="mt-3 text-sm text-foreground">
              No votes were cast on this poll.
            </p>
          )}

          <p className="mt-2 text-sm text-muted-foreground">
            {poll.type === 'binding'
              ? outcome.thresholdMet
                ? `Binding: the ${outcome.thresholdLabel.toLowerCase()} rule was satisfied.`
                : `Binding: the ${outcome.thresholdLabel.toLowerCase()} rule was not satisfied, so nothing takes effect.`
              : 'Informal: this result is advisory and records no decision by itself.'}
            {outcome.turnoutPct !== null &&
              ` Turnout ${outcome.turnoutPct}% (${poll.totalVotes}/${poll.eligibleVoters}).`}
          </p>

          {linkedDecisionId && (
            <Link
              href={`/leagues/${id}/governance/decisions`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Gavel className="h-4 w-4" aria-hidden="true" />
              View the decision recorded from this poll
            </Link>
          )}
        </div>
      )}

      {/* Ballot */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            {isClosed ? 'Options' : 'Cast your vote'}
          </h2>
          {userChoice && (
            <span className="text-xs text-muted-foreground">
              You voted for “{userChoice.text}”.
            </span>
          )}
        </div>

        <PollVotePanel leagueId={id} poll={poll} votable={votable} />

        {!isClosed && expired && (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            The voting window ended on {poll.closesAt ? formatDate(new Date(poll.closesAt)) : 'its deadline'} but
            the poll has not been closed yet, so its result is not official.
            {ctx.isCommissioner ? ' Use “Close poll” to record the outcome.' : ''}
          </p>
        )}

        {!isClosed && !membershipId && (
          <p className="text-xs text-muted-foreground">
            You are not an active member of this league, so you cannot vote on its polls.
          </p>
        )}
      </section>

      {/* Commissioner controls */}
      {!isClosed && ctx.isCommissioner && (
        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Commissioner
          </h2>
          <ClosePollButton pollId={poll.id} />
          <p className="text-xs text-muted-foreground">
            Closing tallies the ballots and scores them against{' '}
            {outcome?.thresholdLabel ?? poll.threshold.toLowerCase()}
            {poll.type === 'binding'
              ? '. If the threshold is met, a decision is recorded automatically.'
              : '. Informal polls never record a decision.'}
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-6">
        <ThresholdBadge threshold={poll.threshold} customThreshold={poll.customThreshold} />
        <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {poll.votingWindowHours}h window
        </span>
      </div>
    </div>
  )
}
