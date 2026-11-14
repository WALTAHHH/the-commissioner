import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import DisputeForm from './dispute-form'

export const dynamic = 'force-dynamic'

/**
 * Raise-dispute page (Governance-2).
 *
 * Open to every league member, unlike the other governance "new" pages:
 * raising a dispute is a claim to be ruled on, not a management action. The
 * gate here is membership (loadLeagueContext → 404 for non-members), which
 * is exactly what `createDispute` re-checks server-side, so there is no
 * page/state pair where the form renders for someone who cannot submit it.
 */
export default async function NewDisputePage({
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Raise a dispute
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · put a contested call in front of the commissioner
        </p>
      </div>

      <DisputeForm leagueId={id} />
    </div>
  )
}
