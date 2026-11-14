import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadCurrentSeasonYear, loadMemberOptions } from '@/src/lib/finances'
import { isUuid } from '@/src/lib/invitations'
import PrizeForm from './prize-form'

export const dynamic = 'force-dynamic'

/**
 * Add-prize page. Commissioner-only: members who navigate here are bounced
 * back to the prize board. `createPrize` re-checks the commissioner rule
 * server-side regardless, so this is a UX gate, not the security one.
 */
export default async function NewPrizePage({
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
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/finances/prizes`)

  const [seasonYear, members] = await Promise.all([
    loadCurrentSeasonYear(id),
    loadMemberOptions(id),
  ])

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
          Add a prize
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · defines a prize for the {seasonYear} season
        </p>
      </div>

      <PrizeForm
        leagueId={id}
        seasonYear={seasonYear}
        members={members.map((m) => ({
          memberId: m.memberId,
          displayName: m.displayName,
        }))}
      />
    </div>
  )
}
