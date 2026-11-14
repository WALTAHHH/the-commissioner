import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext, resolveSeason } from '@/src/lib/dashboard'
import { prettifyLabel, formatDate } from '@/src/lib/display'
import { Settings, Trophy, Users, Hash, Calendar, Mail, Globe } from 'lucide-react'
import { db } from '@/src/lib/db'
import { updateLeagueFinancials } from '@/app/actions/leagues'
import type { LeagueRow } from '@/src/db/rows'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}

  const ctx = await loadLeagueContext(id, session.user.id)
  return {
    title: ctx ? `${ctx.name} settings — The Commissioner` : 'League not found',
  }
}

export default async function LeagueSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const { data: leagueData } = await db
    .from('leagues')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  const league = leagueData as unknown as LeagueRow

  const season = await resolveSeason(id)

  const fields = [
    {
      icon: <Globe className="h-5 w-5" />,
      label: 'League name',
      value: ctx.name,
    },
    {
      icon: <Trophy className="h-5 w-5" />,
      label: 'Sport',
      value: prettifyLabel(ctx.sport),
    },
    {
      icon: <Users className="h-5 w-5" />,
      label: 'Format',
      value: prettifyLabel(ctx.format),
    },
    {
      icon: <Hash className="h-5 w-5" />,
      label: 'URL slug',
      value: ctx.slug,
      mono: true,
    },
    {
      icon: <Mail className="h-5 w-5" />,
      label: 'Commissioner',
      value: ctx.commissionerEmail ?? 'Unknown',
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      label: 'Created',
      value: formatDate(ctx.createdAt),
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            League settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your league's configuration
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Read‑only for now
          </span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div
            key={field.label}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
                {field.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {field.label}
                </p>
                <p className={`mt-1 text-xl font-semibold ${field.mono ? 'font-mono' : ''} text-foreground`}>
                  {field.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Season rollover */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          <h3 className="text-xl font-semibold text-foreground">Season</h3>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">
          Current season year.
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">{season.seasonYear}</span>
          <span className="text-sm text-muted-foreground">
            ({season.source === 'current' ? 'flagged as current' : season.source === 'latest' ? 'most recent season' : 'no season recorded yet'})
          </span>
        </div>
        {ctx.isCommissioner && (
          <div className="mt-6">
            <Link
              href={`/leagues/${id}/settings/rollover`}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start new season
            </Link>
          </div>
        )}
      </div>

      {/* Financial settings */}
      <div className="rounded-2xl border border-border bg-card p-8">
        <h3 className="mb-4 text-xl font-semibold text-foreground">
          Financial settings
        </h3>
        <form
          action={async (formData: FormData) => {
            'use server'
            const leagueId = formData.get('leagueId') as string
            const financialVisibility = formData.get('financialVisibility') as string
            const paymentInstructions = formData.get('paymentInstructions') as string
            const currency = formData.get('currency') as string
            const { revalidatePath } = await import('next/cache')
            await updateLeagueFinancials(leagueId, {
              financialVisibility,
              paymentInstructions,
              currency,
            })
            revalidatePath(`/leagues/${leagueId}/settings`)
          }}
          className="space-y-4"
        >
          <input type="hidden" name="leagueId" value={league.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="financialVisibility" className="mb-1 block text-sm font-medium text-foreground">
                Financial visibility
              </label>
              <select
                id="financialVisibility"
                name="financialVisibility"
                defaultValue={league.financial_visibility ?? 'full_transparency'}
                disabled={!ctx.isCommissioner}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="full_transparency">Full transparency</option>
                <option value="admin_only">Admin only</option>
                <option value="members_see_own">Members see own</option>
                <option value="role_based">Role-based</option>
              </select>
            </div>
            <div>
              <label htmlFor="currency" className="mb-1 block text-sm font-medium text-foreground">
                Default currency
              </label>
              <input
                id="currency"
                name="currency"
                type="text"
                defaultValue={league.currency ?? 'USD'}
                disabled={!ctx.isCommissioner}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="paymentInstructions" className="mb-1 block text-sm font-medium text-foreground">
                Default payment instructions
              </label>
              <textarea
                id="paymentInstructions"
                name="paymentInstructions"
                rows={3}
                defaultValue={league.payment_instructions ?? ''}
                disabled={!ctx.isCommissioner}
                placeholder="e.g. Send dues to @waltahhh on Venmo"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          {ctx.isCommissioner && (
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Save financial settings
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Notice */}
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-8 dark:border-primary/30 dark:bg-primary/20">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
            <Settings className="h-5 w-5 text-primary dark:text-primary/80" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary dark:text-primary/90">
              Settings are read‑only in this phase
            </h3>
            <p className="mt-2 text-primary/80 dark:text-primary/70">
              These fields cannot be edited yet. League renaming, sport/format
              changes, and commissioner hand‑off will arrive in a future release.
            </p>
          </div>
        </div>
      </div>

      {/* Actions placeholder */}
      <div className="rounded-2xl border border-border bg-card p-8">
        <h3 className="mb-4 text-xl font-semibold text-foreground">
          Coming soon
        </h3>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>League renaming and logo upload</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>Advanced scoring settings</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>Member role management</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"></div>
            <span>Season scheduling and draft tools</span>
          </li>
        </ul>
      </div>
    </div>
  )
}