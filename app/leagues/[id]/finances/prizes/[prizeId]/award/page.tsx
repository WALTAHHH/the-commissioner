import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadMemberOptions, loadPrize } from '@/src/lib/finances'
import { isUuid } from '@/src/lib/invitations'
import AwardForm from './award-form'

export const dynamic = 'force-dynamic'

/**
 * Award-prize page. Commissioner-only. The prize is loaded scoped to this
 * league (`loadPrize(id, prizeId)` returns null for a foreign id), so an id
 * from another league 404s rather than leaking. `awardPrize` re-checks the
 * commissioner rule server-side regardless.
 */
export default async function AwardPrizePage({
  params,
}: {
  params: Promise<{ id: string; prizeId: string }>
}) {
  const { id, prizeId } = await params
  if (!isUuid(id) || !isUuid(prizeId)) notFound()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const ctx = await loadLeagueContext(id, user.id)
  if (!ctx) notFound()
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/finances/prizes`)

  const prize = await loadPrize(id, prizeId)
  if (!prize) notFound()

  const members = await loadMemberOptions(id)

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/leagues/${id}/finances/prizes`}
          scroll={false}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to prizes
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Award a prize
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · record who won this {prize.scope === 'weekly' ? 'weekly' : 'season'}{' '}
          {prize.type === 'payout' ? 'payout' : 'award'}
        </p>
      </div>

      <AwardForm
        leagueId={id}
        prize={prize}
        members={members.map((m) => ({
          memberId: m.memberId,
          displayName: m.displayName,
        }))}
      />
    </div>
  )
}
