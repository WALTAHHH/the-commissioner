'use client'

import { useState } from 'react'
import { connectSleeper } from '@/app/actions/integrations'
import { Hash } from 'lucide-react'

/**
 * Sleeper connect form (Sleeper-2). One field: the numeric league ID from
 * the Sleeper league URL. The server action verifies the league exists via
 * the Sleeper API before saving, so every failure — malformed ID, unknown
 * league, already connected, unreachable API — comes back here as a plain
 * message under the input. On success the action revalidates this route and
 * the page repaints as the connected view; no client-side navigation needed.
 */
export default function ConnectSleeperForm({ leagueId }: { leagueId: string }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const sleeperLeagueId = String(formData.get('sleeperLeagueId') ?? '')

    const result = await connectSleeper(leagueId, sleeperLeagueId)
    setLoading(false)

    if (result?.error) {
      setError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        Connect a Sleeper league
      </h2>

      <div>
        <label
          htmlFor="sleeperLeagueId"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Hash className="h-4 w-4" />
          Sleeper League ID
        </label>
        <input
          id="sleeperLeagueId"
          name="sleeperLeagueId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          placeholder="289646328504385536"
          required
          disabled={loading}
          className="w-full rounded-lg border border-input bg-transparent px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Find this in your Sleeper league URL: sleeper.com/leagues/{'{league_id}'}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
      >
        {loading ? 'Checking with Sleeper…' : 'Connect league'}
      </button>
    </form>
  )
}
