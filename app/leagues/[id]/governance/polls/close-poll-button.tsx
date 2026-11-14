'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { closePoll } from '@/app/actions/governance'

/**
 * "Close poll" control (Governance-2, commissioner only).
 *
 * Closing is the moment a verdict becomes real: `closePoll` tallies the
 * ballots, scores them against the threshold and — for a binding poll that
 * passes — writes the Decision row. It is deliberately a two-step
 * confirmation, not a one-tap button, and it stays available on an
 * already-expired poll because nothing closes polls on a timer.
 */
export default function ClosePollButton({ pollId }: { pollId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function close() {
    setError(null)
    startTransition(async () => {
      const result = await closePoll(pollId)
      if (result.error) {
        setError(result.error)
        setConfirming(false)
        return
      }
      setConfirming(false)
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <CheckCircle2 className="h-4 w-4" />
          Close poll
        </button>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium text-foreground">
        Close this poll and record the result?
      </p>
      <p className="text-xs text-muted-foreground">
        Voting stops immediately. Vote counts cannot change after this.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Closing…' : 'Yes, close it'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setError(null)
          }}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Keep it open
        </button>
      </div>
    </div>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      {children}
    </p>
  )
}
