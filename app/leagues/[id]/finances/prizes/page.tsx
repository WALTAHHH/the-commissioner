import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trophy, Info } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadCurrentSeasonYear, loadPrizes } from '@/src/lib/finances'
import { isUuid } from '@/src/lib/invitations'
import FinancesNav from '../finances-nav'
import { PrizeGroup } from './prize-card'
import { buttonVariants } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

/**
 * Prizes (Finances-2): everything the commissioner defines for a season —
 * money payouts and recognition awards, at season end or in a given week —
 * and who has won each one so far.
 *
 * Commissioner defines and awards; every member can view (prizes are public
 * league information). Scoped to the current season. The read goes through
 * `loadPrizes` (gated by `loadLeagueContext`), not the `authorize()`-based
 * actions, because the read path in this app trusts league membership.
 */
export default async function LeaguePrizesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()

  const seasonYear = await loadCurrentSeasonYear(id)
  const sections = await loadPrizes(id, seasonYear)

  const totalCount =
    sections.season.payouts.length +
    sections.season.recognitions.length +
    sections.weekly.payouts.length +
    sections.weekly.recognitions.length

  const base = `/leagues/${id}/finances/prizes`

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Prizes
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ctx.name} · {seasonYear} season · payouts and awards, season-end
            and weekly
          </p>
        </div>
        {/* The Add button is ALWAYS shown to the commissioner — even when no
            prizes exist yet. (The old page hid it, leaving "Add 1st place to
            get started" with no way to actually do it.) */}
        {ctx.isCommissioner && (
          <Link
            href={`${base}/new`}
            scroll={false}
            className={buttonVariants({ size: 'lg' })}
          >
            <Plus className="h-4 w-4" />
            Add prize
          </Link>
        )}
      </div>

      <FinancesNav leagueId={id} active="prizes" />

      {!ctx.isCommissioner && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Only the commissioner can add or award prizes — this is the
          season&rsquo;s prize board.
        </p>
      )}

      {totalCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Trophy
            className="mx-auto h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            No prizes defined for {seasonYear} yet.{' '}
            {ctx.isCommissioner
              ? 'Add one to get started — a payout for the winner, or a recognition award like the Golden Toilet.'
              : 'Check back soon.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Season prizes */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Season prizes
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PrizeGroup
                title="Season payouts"
                prizes={sections.season.payouts}
                leagueId={id}
                canEdit={ctx.isCommissioner}
              />
              <PrizeGroup
                title="Season recognitions"
                prizes={sections.season.recognitions}
                leagueId={id}
                canEdit={ctx.isCommissioner}
              />
            </div>
          </section>

          {/* Weekly prizes */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Weekly prizes
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PrizeGroup
                title="Weekly payouts"
                prizes={sections.weekly.payouts}
                leagueId={id}
                canEdit={ctx.isCommissioner}
              />
              <PrizeGroup
                title="Weekly recognitions"
                prizes={sections.weekly.recognitions}
                leagueId={id}
                canEdit={ctx.isCommissioner}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
