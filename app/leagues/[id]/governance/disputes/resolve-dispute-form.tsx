'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gavel } from 'lucide-react'
import { resolveDispute } from '@/app/actions/governance'

const MAX_RESOLUTION = 5000

/**
 * Inline "resolve this dispute" control (Governance-2, commissioner only).
 *
 * `resolveDispute` refuses anything but an open dispute, so the form folds
 * away on success and the refreshed page shows the resolved card instead —
 * there is no editable state after the ruling is written.
 */
export default function ResolveDisputeForm({ disputeId }: { disputeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const trimmed = resolution.trim()
    if (!trimmed) {
      setError('Write the ruling before resolving.')
      return
    }
    if (trimmed.length > MAX_RESOLUTION) {
      setError(`Resolution must be at most ${MAX_RESOLUTION} characters.`)
      return
    }
    startTransition(async () => {
      const result = await resolveDispute(disputeId, { resolution: trimmed })
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      setResolution('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Gavel className="h-4 w-4" />
          Resolve
        </button>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
      <label className="block text-sm font-medium text-foreground">
        Resolution
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {resolution.length}/{MAX_RESOLUTION}
        </span>
      </label>
      <textarea
        value={resolution}
        maxLength={MAX_RESOLUTION}
        rows={3}
        autoFocus
        onChange={(e) => setResolution(e.target.value)}
        placeholder="What you decided, and any action taken."
        className="w-full resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Resolving…' : 'Record resolution'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Cancel
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
