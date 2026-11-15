import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadLeagueContext, resolveSeason } from '@/src/lib/dashboard'
import { rolloverSeason } from '@/app/actions/leagues'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, Calendar, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `Rollover season — ${ctx.name} — The Commissioner` : 'League not found',
  }
}

export default async function RolloverSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()
  if (!ctx.isCommissioner) {
    // Not a commissioner — redirect back to settings
    redirect(`/leagues/${id}/settings`)
  }

  const season = await resolveSeason(id)
  const currentYear = season.seasonYear
  const defaultNewYear = currentYear + 1

  const checklistItems = [
    'Creates a new season row flagged as current',
    'Archives the current season row (sets is_current = false)',
    'Preserves all historical data — previous seasons remain untouched',
    'Obligations, rules, and member roster carry over unchanged',
    'No data is deleted; season list becomes a permanent archive',
  ]

  async function handleRollover(formData: FormData) {
    'use server'
    const leagueId = formData.get('leagueId') as string
    const newSeasonYear = parseInt(formData.get('newSeasonYear') as string, 10)
    const { season, error } = await rolloverSeason(leagueId, { newSeasonYear })
    if (error) {
      // Redirect back with error query param
      redirect(`/leagues/${leagueId}/settings/rollover?error=${encodeURIComponent(error)}`)
    }
    // Success: redirect to league dashboard with toast
    redirect(`/leagues/${leagueId}?toast=Season+rolled+over`)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Roll over to a new season
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Archive the current season and start a fresh one. All league data carries over.
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 dark:border-red-700 dark:bg-red-950">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-300">
                Rollover failed
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Current season card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          <h2 className="text-xl font-semibold text-foreground">Current season</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          The season that will be archived when you roll over.
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-foreground">{currentYear}</span>
          <span className="text-sm text-muted-foreground">
            ({season.source === 'current' ? 'flagged as current' : season.source === 'latest' ? 'most recent season' : 'no season recorded yet'})
          </span>
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          <h2 className="text-xl font-semibold text-foreground">What rollover does</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Summary of changes that will happen when you confirm.
        </p>
        <ul className="space-y-3">
          {checklistItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
              <span className="text-sm text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Rollover form */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <h2 className="text-xl font-semibold text-foreground">Start new season</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Choose the year for the new season. The current season will be archived.
        </p>
        <form action={handleRollover} className="space-y-6">
          <input type="hidden" name="leagueId" value={id} />
          <div className="space-y-2">
            <label htmlFor="newSeasonYear" className="block text-sm font-medium text-foreground">
              New season year
            </label>
            <Input
              id="newSeasonYear"
              name="newSeasonYear"
              type="number"
              min={2000}
              max={2100}
              defaultValue={defaultNewYear}
              className="max-w-xs"
              required
            />
            <p className="text-xs text-muted-foreground">
              Must be between 2000 and 2100. Defaults to current year + 1.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" variant="default">
              Roll over to new season
            </Button>
            <Link
              href={`/leagues/${id}/settings`}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}