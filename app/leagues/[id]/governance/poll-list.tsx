import Link from 'next/link'
import { Check, MessageSquare, Vote } from 'lucide-react'
import { formatDate, formatPercentage, pluralizeCount } from '@/src/lib/display'
import {
  computeOutcome,
  isPollExpired,
  type PollView,
} from '@/src/lib/governance'
import PollCountdown, { initialCountdownLabel } from './poll-countdown'
import {
  OutcomeBadge,
  PollStatusBadge,
  PollTypeBadge,
  ThresholdBadge,
} from './governance-badges'

/**
 * Poll cards for the hub and the polls list (Governance-2).
 *
 * Server component. Open cards carry vote totals, turnout and a live
 * countdown to `closes_at`; closed cards carry the derived outcome so the
 * league can see at a glance whether a binding poll actually passed. The
 * leading option is drawn as a bar per option, which is also what makes a
 * tie legible without reading the numbers.
 */
export default function PollList({
  leagueId,
  polls,
  emptyLabel,
}: {
  leagueId: string
  polls: PollView[]
  emptyLabel: string
}) {
  if (polls.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Vote className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {polls.map((poll) => (
        <PollCard key={poll.id} leagueId={leagueId} poll={poll} />
      ))}
    </ul>
  )
}

function PollCard({ leagueId, poll }: { leagueId: string; poll: PollView }) {
  const expired = isPollExpired(poll)
  const votable = poll.status === 'open' && !expired
  const outcome = poll.status === 'closed' ? computeOutcome(poll) : null
  const leading = poll.options.reduce(
    (max, option) => Math.max(max, option.voteCount),
    0,
  )
  const href = `/leagues/${leagueId}/governance/polls/${poll.id}`

  return (
    <li>
      <Link
        href={href}
        className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent/40 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {poll.title}
            </h3>
            {poll.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {poll.description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <PollStatusBadge status={poll.status} expired={expired} />
            <PollTypeBadge type={poll.type} />
          </div>
        </div>

        {/* Result bars: only after a poll closes, so an open poll cannot be
            read as a running tally with false authority. */}
        {poll.status === 'closed' && poll.options.length > 0 && (
          <div className="mt-4 space-y-2">
            {poll.options.map((option) => {
              const pct = formatPercentage(option.voteCount, poll.totalVotes)
              const isWinner = outcome?.winningOption?.id === option.id
              return (
                <div key={option.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span
                      className={`truncate ${
                        isWinner ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {option.text}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {pluralizeCount(option.voteCount, 'vote')} · {pct}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        isWinner ? 'bg-primary' : 'bg-muted-foreground/40'
                      }`}
                      style={{ width: pct }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Vote className="h-3.5 w-3.5" aria-hidden="true" />
            {pluralizeCount(poll.totalVotes, 'vote')}
            {poll.eligibleVoters > 0 ? (
              <span className="tabular-nums">
                {' '}
                · {formatPercentage(poll.totalVotes, poll.eligibleVoters)} turnout
              </span>
            ) : null}
          </span>

          <ThresholdBadge threshold={poll.threshold} customThreshold={poll.customThreshold} />

          {votable && poll.closesAt ? (
            <PollCountdown
              closesAt={poll.closesAt}
              initialLabel={initialCountdownLabel(poll.closesAt)}
            />
          ) : null}

          {poll.status === 'closed' && outcome ? (
            <OutcomeBadge passed={outcome.thresholdMet} isTie={outcome.isTie} />
          ) : null}

          {poll.userVoteOptionId ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              You voted
            </span>
          ) : null}

          {poll.status === 'cancelled' ? (
            <span>Cancelled {poll.closedAt ? formatDate(new Date(poll.closedAt)) : ''}</span>
          ) : null}

          {poll.status === 'open' && leading === 0 && poll.totalVotes === 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              No votes yet
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  )
}
