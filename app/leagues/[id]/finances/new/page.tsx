import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadLeagueContext } from '@/src/lib/dashboard'
import {
  loadFinancialCategories,
  loadMemberOptions,
} from '@/src/lib/finances'
import { isUuid } from '@/src/lib/invitations'
import ObligationForm from './obligation-form'

export const dynamic = 'force-dynamic'

/**
 * Create-obligation page (Finances-2). Commissioner-only: members who
 * navigate here are bounced back to the hub — creation is a management
 * action, and the createObligation/createBulkObligations actions re-check
 * authorization server-side regardless.
 */
export default async function NewObligationPage({
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
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/finances`)

  const [members, categories] = await Promise.all([
    loadMemberOptions(id),
    loadFinancialCategories(id),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          New obligation
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · record money a member owes the league
        </p>
      </div>

      <ObligationForm
        leagueId={id}
        members={members.map((m) => ({
          memberId: m.memberId,
          displayName: m.displayName,
        }))}
        categories={categories}
      />
    </div>
  )
}
