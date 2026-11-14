import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import {
  loadCurrentSeasonYear,
  loadPrizeStructure,
} from '@/src/lib/finances'
import { isUuid } from '@/src/lib/invitations'
import FinancesNav from '../finances-nav'
import PrizeEditor from './prize-editor'

export const dynamic = 'force-dynamic'

/**
 * Prize structure (Finances-2): what each finishing place pays out.
 *
 * Commissioner edits; every member can view — prizes are public league
 * information and the read carries no per-member data. Scopes to the
 * current season (league_seasons is_current → newest → calendar year);
 * the editor upserts per (season, place), so re-saving 2nd for 2026
 * updates that row instead of duplicating it.
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
  const prizes = await loadPrizeStructure(id, seasonYear)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Prize structure
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · {seasonYear} season payouts
        </p>
      </div>

      <FinancesNav leagueId={id} active="prizes" />

      {!ctx.isCommissioner && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Only the commissioner can edit prizes — this is the payout preview
          for the season.
        </p>
      )}

      <PrizeEditor
        leagueId={id}
        seasonYear={seasonYear}
        prizes={prizes.map((p) => ({
          id: p.id,
          place: p.place,
          description: p.description,
          amount: p.amount,
        }))}
        canEdit={ctx.isCommissioner}
      />
    </div>
  )
}
