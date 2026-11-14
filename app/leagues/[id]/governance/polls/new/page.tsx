import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import PollForm from './poll-form'

export const dynamic = 'force-dynamic'

/**
 * Create-poll page (Governance-2). Commissioner-only: a member sent here is
 * bounced back to the governance hub — opening a league-wide vote is a
 * management action, and `createPoll` re-checks authorization server-side
 * regardless of what this page renders.
 */
export default async function NewPollPage({
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
  if (!ctx.isCommissioner) redirect(`/leagues/${id}/governance`)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          New poll
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ctx.name} · put a question to the league
        </p>
      </div>

      <PollForm leagueId={id} />
    </div>
  )
}
