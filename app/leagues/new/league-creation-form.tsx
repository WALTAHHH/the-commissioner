'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createLeague } from '@/app/actions/leagues'
import { connectSleeper } from '@/app/actions/integrations'
import { SPORT_OPTIONS, FORMAT_OPTIONS } from '@/src/lib/league-options'
import { Trophy, Users, Hash, CheckCircle } from 'lucide-react'

/**
 * Step 2 — review & confirm.
 *
 * Rendered in two modes from the same component:
 *  - Sleeper import: pre-filled `initialValues` + an `imported` descriptor
 *    ("Imported from Sleeper" badge, member count). On confirm we create the
 *    league and then save the Sleeper connection (`connectSleeper`) — the
 *    preview in Step 1 never writes anything to our DB.
 *  - Manual ("I'll connect later"): empty form, no `imported`, platform can
 *    be connected later from the league's integrations hub.
 *
 * All values stay editable — the import is a pre-fill, not a lock-in; the
 * commissioner may want to rename the league or adjust the format.
 */

interface ImportedInfo {
  /** Sleeper league ID — the connection row is created with this on confirm. */
  sleeperLeagueId: string
  /** League name as fetched from Sleeper (display in the badge). */
  name: string
  /** Display label for scoring/style, e.g. 'PPR Redraft'. */
  formatLabel?: string
  memberCount?: number
  teamCount?: number
}

interface LeagueCreationFormProps {
  /** Pre-filled values from the Sleeper preview; empty in manual mode. */
  initialValues?: {
    name: string
    sport: string
    format: string
    season: string
  }
  /** Present only when this league was imported from Sleeper in Step 1. */
  imported?: ImportedInfo
}

export default function LeagueCreationForm({
  initialValues = { name: '', sport: '', format: '', season: '' },
  imported,
}: LeagueCreationFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await createLeague(formData)
    if (result.error || !result.leagueId) {
      setError(result.error ?? 'Something went wrong.')
      setLoading(false)
      return
    }

    // The league row is committed at this point. If the Sleeper connection
    // fails (e.g. a race against another league claiming the same Sleeper
    // ID), we must NOT park the user on this form — a retry would create a
    // second league. The league exists and is fully usable; Sleeper can be
    // connected (or retried) from the integrations hub at any time.
    if (imported?.sleeperLeagueId) {
      const connection = await connectSleeper(result.leagueId, imported.sleeperLeagueId)
      if (connection.error) {
        console.warn('League created, but Sleeper connect failed:', connection.error)
      }
    }

    router.push(`/leagues/${result.leagueId}`)
  }

  const badgeFacts = imported
    ? [
        imported.memberCount
          ? `${imported.memberCount} members`
          : imported.teamCount
            ? `${imported.teamCount} teams`
            : null,
        imported.formatLabel || null,
        initialValues.season ? `${initialValues.season} season` : null,
      ].filter(Boolean)
    : []

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {imported && (
        <div className="rounded-lg border border-border bg-blue-50/50 p-4 dark:bg-blue-900/30">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="font-medium text-foreground">Imported from Sleeper</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[imported.name, ...badgeFacts].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="name"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Hash className="h-4 w-4" />
          League name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          minLength={2}
          maxLength={80}
          placeholder="Sunday Bloodbath"
          required
          defaultValue={initialValues.name}
          className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>

      <div>
        <label
          htmlFor="sport"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Trophy className="h-4 w-4" />
          Sport
        </label>
        <select
          id="sport"
          name="sport"
          defaultValue={initialValues.sport || 'football'}
          className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {SPORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="format"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Users className="h-4 w-4" />
          Format
        </label>
        <select
          id="format"
          name="format"
          defaultValue={initialValues.format || 'redraft'}
          className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted-foreground">
          {imported && initialValues.season
            ? `Your Sleeper league is on the ${initialValues.season} season; the league record starts in the current season either way.`
            : 'The league record starts in the current season.'}
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
        className="w-full rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create league'}
      </button>
    </form>
  )
}
