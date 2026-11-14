import Link from 'next/link'
import { createClient } from '@/src/utils/supabase/server'
import { redirect } from 'next/navigation'
import LeagueCreationForm, { type ImportedInfo } from './league-creation-form'
import SleeperImportForm from './sleeper-import-form'
import EspnImportForm, {
  type ESPNVerifyInput,
  type ESPNVerifyResponse,
} from './espn-import-form'
import { resolveCookies, verifyESPNLeague } from '@/src/lib/integrations/espn/snapshot'
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
 * the league already lives there and everything pre-fills) — Option B —
 * connect an ESPN league (same idea, over ESPN's unofficial read API) —
 * plus a quieter fallback below them to set up manually and connect later.
 *
 * Step 2 (`?mode=manual`, or any `?sleeperLeagueId=` / `?espnLeagueId=` in
 * the URL): the review & confirm form. Import data travels between the steps
 * as URL params — simple, shareable, no client store — populated by
 * `sleeper-import-form.tsx` / `espn-import-form.tsx` after their respective
 * previews succeed.
 *
 * The ESPN verification runs here as an inline Server Function (not in the
 * browser): ESPN's private-league auth rides on a `Cookie` header, which a
 * browser fetch() can't set (forbidden header), and the adapter +
 * `verifyESPNLeague` helpers are server modules. It is read-only — no DB
 * writes happen until Step 2 confirms, and the ESPN connection row itself is
 * created later from the integrations hub, which this flow deliberately
 * doesn't touch yet.
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

  async function verifyESPN(input: ESPNVerifyInput): Promise<ESPNVerifyResponse> {
    'use server'
    // Actions re-check auth themselves — a forged call to the action endpoint
    // never inherits this page's redirect guard.
    const actionSupabase = await createClient()
    const {
      data: { session: actionSession },
    } = await actionSupabase.auth.getSession()
    if (!actionSession?.user) {
      return {
        ok: false,
        error: 'Your session expired — sign in again and retry the import.',
        kind: 'api',
        needsCookies: false,
      }
    }

    const seasonYear = Number.parseInt(String(input?.seasonYear ?? ''), 10)
    const { cookies, error: cookieError } = resolveCookies({
      espnS2: input?.espnS2,
      swid: input?.swid,
    })
    if (cookieError) {
      return { ok: false, error: cookieError, kind: 'invalid', needsCookies: true }
    }

    const result = await verifyESPNLeague(String(input?.leagueId ?? ''), seasonYear, cookies)
    if (result.ok) return { ok: true, league: result.league }
    return {
      ok: false,
      error: result.error,
      kind: result.kind,
      needsCookies: result.needsCookies,
    }
  }

  const params = await searchParams
  const sleeperLeagueId = first(params.sleeperLeagueId)
  const espnLeagueId = first(params.espnLeagueId)
  const mode = first(params.mode)
  const step = first(params.step)

  const imported: ImportedInfo | undefined = sleeperLeagueId
    ? {
        sleeperLeagueId,
        name: first(params.name) ?? 'Your Sleeper league',
        formatLabel: first(params.formatLabel) ?? '',
        memberCount: parseCount(first(params.memberCount)),
        teamCount: parseCount(first(params.teamCount)),
      }
    : espnLeagueId
      ? {
          espnLeagueId,
          name: first(params.name) ?? 'Your ESPN league',
          seasonYear: first(params.seasonYear) ?? first(params.season),
          espnS2: first(params.espnS2),
          swid: first(params.swid),
        }
      : undefined
  const showReview =
    step === 'review' || !!sleeperLeagueId || !!espnLeagueId || mode === 'manual'

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
              : 'Your league already exists. Give it an administrative home: connect Sleeper or ESPN and we\u2019ll pre-fill everything.'}
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
              imported={imported}
            />
            <p className="mt-6 text-center">
              <Link
                href="/leagues/new"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {espnLeagueId
                  ? '\u2190 Use a different ESPN league'
                  : imported
                    ? '\u2190 Use a different Sleeper league'
                    : '\u2190 Back to import options'}
              </Link>
            </p>
          </div>
        ) : (
          <>
            <SleeperImportForm />
            <EspnImportForm verifyESPN={verifyESPN} />

            {/* Manual fallback — deliberately quieter than the import paths. */}
            <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Not on Sleeper or ESPN, or want to decide later?{' '}
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
