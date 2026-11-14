'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertSeasonRecap } from '@/app/actions/history'

const MAX_BODY = 10000

/**
 * Season recap editor (commissioner). Markdown body, saved with
 * `upsertSeasonRecap` — one recap per (league, season); editing replaces
 * the body and moves updated_at.
 */
export default function RecapForm({
  leagueId,
  seasonYear,
  initialBody,
}: {
  leagueId: string
  seasonYear: number
  initialBody: string
}) {
  const router = useRouter()
  const [body, setBody] = useState(initialBody)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const wasExisting = initialBody.trim().length > 0

  function submit() {
    setError(null)
    setSaved(false)
    const trimmed = body.trim()
    if (!trimmed) {
      setError('Recap body is required.')
      return
    }
    if (trimmed.length > MAX_BODY) {
      setError(`Recap body must be at most ${MAX_BODY.toLocaleString()} characters.`)
      return
    }

    startTransition(async () => {
      const result = await upsertSeasonRecap(leagueId, seasonYear, { body: trimmed })
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        maxLength={MAX_BODY}
        placeholder="Markdown supported — how the season unfolded, notable storylines, standout performances…"
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <p className="text-xs text-muted-foreground">
        {body.trim().length.toLocaleString()}/{MAX_BODY.toLocaleString()} characters
        {wasExisting ? ' · saving updates the existing recap' : ''}
      </p>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          Recap saved.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Saving…' : wasExisting ? 'Update recap' : 'Save recap'}
      </button>
    </div>
  )
}
