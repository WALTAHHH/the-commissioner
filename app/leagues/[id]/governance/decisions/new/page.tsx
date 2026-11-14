import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadPollChoices } from '@/src/lib/governance'
import { isUuid } from '@/src/lib/invitations'
import DecisionForm from './decision-form'

export const dynamic = 'force-dynamic'

/**
 * Record-decision page (Governance-2). Commissioner only — same rule as
 * create-poll: writing an authoritative verdict is a management action, and
 * `recordDecision` re-checks it server-side regardless of this render.
 */
export default async function NewDecisionPage({
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
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/governance/decisions`)

  const polls = await loadPollChoices(id)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Record a decision
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · write a verdict into the league&apos;s decision log
        </p>
      </div>

      <DecisionForm leagueId={id} polls={polls} />
    </div>
  )
}
