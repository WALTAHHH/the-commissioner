'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createDispute } from '@/app/actions/governance'

const MAX_DESCRIPTION = 5000

/**
 * Raise-dispute form (Governance-2) — any active member, not only the
 * commissioner: `createDispute` requires an active membership and then asks
 * the authorization layer, so the button is open to the whole league.
 *
 * Field limits mirror the action rather than inventing their own; the action
 * is the authority and a submission it rejects should never look submittable.
 */
export default function DisputeForm({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const trimmed = description.trim()
    if (!trimmed) {
      setError('Describe what is being disputed.')
      return
    }
    if (trimmed.length > MAX_DESCRIPTION) {
      setError(`Description must be at most ${MAX_DESCRIPTION} characters.`)
      return
    }

    startTransition(async () => {
      const result = await createDispute(leagueId, { description: trimmed })
      if (result.error || !result.disputeId) {
        setError(result.error ?? 'Failed to raise the dispute.')
        return
      }
      router.push(`/leagues/${leagueId}/governance/disputes`)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label
            htmlFor="dispute-description"
            className="text-sm font-semibold text-foreground"
          >
            What is disputed?
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {description.length}/{MAX_DESCRIPTION}
          </span>
        </div>
        <textarea
          id="dispute-description"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={6}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Week 7 lineup was copied from another league's starting QB. I'm disputing the points for that matchup."
          className="w-full resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          The commissioner rules on this and writes the resolution back into the
          record. Include dates, matchups and who was involved.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push(`/leagues/${leagueId}/governance/disputes`)}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShieldAlert className="h-4 w-4" />
          {pending ? 'Raising…' : 'Raise dispute'}
        </button>
      </div>
    </div>
  )
}
