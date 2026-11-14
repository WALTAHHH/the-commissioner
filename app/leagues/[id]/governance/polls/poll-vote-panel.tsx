'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Vote } from 'lucide-react'
import { castVote } from '@/app/actions/governance'
import { formatPercentage } from '@/src/lib/display'
import type { PollView } from '@/src/lib/governance'

/**
 * Option list for a live poll (Governance-2).
 *
 * One option per member, and the action layer enforces it with a unique
 * index; here a voted ballot simply stops being clickable and the chosen row
 * is highlighted, so the page cannot invite a second attempt. `votable` is
 * decided by the server (status, membership) and expiry is re-checked client
 * side at click time, because `closes_at` can pass while the page sits open
 * and nothing flips the stored status.
 */
export default function PollVotePanel({
  leagueId,
  poll,
  votable,
}: {
  leagueId: string
  poll: PollView
  /** Viewer may cast a ballot: member, poll open, not cancelled. */
  votable: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(poll.userVoteOptionId)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isOpen = poll.status === 'open'
  const leading = poll.options.reduce((max, o) => Math.max(max, o.voteCount), 0)

  function vote(optionId: string) {
    setError(null)
    if (selected) return
    const closes = poll.closesAt ? new Date(poll.closesAt).getTime() : null
    if (closes !== null && Number.isFinite(closes) && closes <= Date.now()) {
      setError('The voting window has ended — the commissioner still needs to close this poll.')
      return
    }
    startTransition(async () => {
      const result = await castVote(poll.id, optionId)
      if (result.error) {
        // A duplicate-vote rejection means the ballot is actually on file;
        // lock the UI and let the refresh pick up the stored choice.
        if (/already voted/i.test(result.error)) {
          setSelected(optionId)
          router.refresh()
        }
        setError(result.error)
        return
      }
      setSelected(optionId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {poll.options.map((option) => {
          const isMine = selected === option.id
          const isLeading = isOpen && leading > 0 && option.voteCount === leading
          const disabled = !votable || selected !== null || pending
          const pct = formatPercentage(option.voteCount, poll.totalVotes)

          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => vote(option.id)}
                disabled={disabled}
                aria-pressed={isMine}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  isMine
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card'
                } ${
                  votable && !selected
                    ? 'cursor-pointer hover:border-primary/50 hover:bg-accent/50'
                    : 'cursor-default'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-medium text-foreground">
                    {option.text}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {isMine && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Your vote
                      </span>
                    )}
                    {!isMine && isLeading && (
                      <span className="text-xs font-medium text-muted-foreground">Leading</span>
                    )}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isMine ? 'bg-primary' : 'bg-muted-foreground/40'
                      }`}
                      style={{ width: pct }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {option.voteCount} {option.voteCount === 1 ? 'vote' : 'votes'} · {pct}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {isOpen && !selected && votable && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Vote className="h-3.5 w-3.5" aria-hidden="true" />
          Tap an option to cast your vote. One vote per member; it cannot be changed.
        </p>
      )}
      {isOpen && !votable && !error && (
        <p className="text-xs text-muted-foreground">
          Voting is closed to you on this poll — only active league members can vote.
        </p>
      )}
    </div>
  )
}
