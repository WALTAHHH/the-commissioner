import Link from 'next/link'
import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import LeagueCreationForm from './league-creation-form'
import SleeperImportForm from './sleeper-import-form'
import { Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

type SearchParams = { [key: string]: string | string[] | undefined }

/** A query param can arrive repeated; we always take the first value. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseCount(value: string | undefined): number | undefined {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * Onboarding entry point (import-first redesign).
 *
 * Step 1 (default view): Option A — connect a Sleeper league (recommended;
 * the league already lives there and everything pre-fills) — plus a quieter
 * Option B below it to set up manually and connect later.
 *
 * Step 2 (`?mode=manual`, or any `?sleeperLeagueId=` in the URL): the
 * review & confirm form. Sleeper import data travels between the steps as
 * URL params — simple, shareable, no client store — populated by
 * `sleeper-import-form.tsx` after `previewSleeperLeague` succeeds.
 */
export default async function NewLeaguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    redirect('/login')
  }

  const params = await searchParams
  const sleeperLeagueId = first(params.sleeperLeagueId)
  const mode = first(params.mode)
  const step = first(params.step)

  const imported = !!sleeperLeagueId
  const showReview = step === 'review' || imported || mode === 'manual'

  return (
    <div className="flex min-h-screen items-center justify-center p-4 font-sans">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {showReview ? 'Review & confirm' : 'Bring your league home'}
          </h1>
          <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
            {showReview
              ? 'Confirm the details below — you will be its commissioner.'
              : 'Your league already exists. Give it an administrative home: connect Sleeper and we\u2019ll pre-fill everything.'}
          </p>
        </div>

        {showReview ? (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
            <LeagueCreationForm
              initialValues={{
                name: first(params.name) ?? '',
                sport: first(params.sport) ?? '',
                format: first(params.format) ?? '',
                season: first(params.season) ?? '',
              }}
              imported={
                sleeperLeagueId
                  ? {
                      sleeperLeagueId,
                      name: first(params.name) ?? 'Your Sleeper league',
                      formatLabel: first(params.formatLabel) ?? '',
                      memberCount: parseCount(first(params.memberCount)),
                      teamCount: parseCount(first(params.teamCount)),
                    }
                  : undefined
              }
            />
            <p className="mt-6 text-center">
              <Link
                href="/leagues/new"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {imported
                  ? '\u2190 Use a different Sleeper league'
                  : '\u2190 Back to import options'}
              </Link>
            </p>
          </div>
        ) : (
          <>
            <SleeperImportForm />

            {/* Option B — deliberately quieter than the Sleeper path. */}
            <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Not on Sleeper, or want to decide later?{' '}
                <Link
                  href="/leagues/new?mode=manual"
                  className="font-medium text-primary hover:underline"
                >
                  Set up manually — I&rsquo;ll connect later
                </Link>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                You can connect a fantasy platform any time from your league settings.
              </p>
            </div>
          </>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  )
}
