import Link from 'next/link'
import { Vote } from 'lucide-react'
import { formatDate, formatRelativeTime, pluralizeCount, prettifyLabel } from '@/src/lib/display'
import type { MemberVoteView } from '@/src/lib/member-votes'

/**
 * Member profile → Votes.
 *
 * A self-contained server component: it takes the already-loaded vote list and
 * renders its own empty / populated states, so the profile page never has to
 * know how votes are read. Read-only by design — casting and closing polls live
 * in the governance hub; this section links there instead of growing a second
 * voting surface.
 *
 * Every active member of the league may see the profile, so the governance
 * record of how a member voted is shown to the league. Each row links to the
 * poll it belongs to.
 */
export default function MemberVotesSection({
  leagueId,
  votes,
}: {
  leagueId: string
  /** Cast votes, newest first (see loadMemberVotesSection). */
  votes: MemberVoteView[]
}) {
  const now = new Date()

  return (
    <section id="votes" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className="text-muted-foreground" aria-hidden="true">
            <Vote className="h-5 w-5" />
          </span>
          Votes
        </h2>
        <span className="text-xs text-muted-foreground">
          {pluralizeCount(votes.length, 'vote')}
        </span>
      </div>

      {votes.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          <span className="text-muted-foreground/70" aria-hidden="true">
            <Vote className="h-5 w-5" />
          </span>
          No poll votes recorded in this league.
        </div>
      ) : (
        <ul className="space-y-3">
          {votes.map((v) => (
            <VoteCard key={v.voteId} leagueId={leagueId} vote={v} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}

function VoteCard({
  leagueId,
  vote,
  now,
}: {
  leagueId: string
  vote: MemberVoteView
  now: Date
}) {
  const castAt = new Date(vote.castAt)
  return (
    <li className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
        <Vote className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <Link
          href={`/leagues/${leagueId}/governance/polls/${vote.pollId}`}
          className="text-base font-semibold text-foreground hover:underline"
        >
          {vote.pollTitle}
        </Link>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Voted <span className="font-medium text-foreground">{vote.optionText}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5">
            {prettifyLabel(vote.pollType)} · {prettifyLabel(vote.pollStatus)}
          </span>
          {' · '}
          <time dateTime={vote.castAt} title={formatDate(castAt)}>
            {formatRelativeTime(castAt, now)}
          </time>
        </p>
      </div>
    </li>
  )
}
