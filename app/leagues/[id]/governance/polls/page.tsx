import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadMembershipId } from '@/src/lib/finances'
import { loadPolls } from '@/src/lib/governance'
import { isUuid } from '@/src/lib/invitations'
import GovernanceNav from '../governance-nav'
import PollList from '../poll-list'

export const dynamic = 'force-dynamic'

/**
 * Every poll in the league (Governance-2), open first.
 *
 * The hub already answers "what's live right now"; this is the archive —
 * the full list a member scrolls to see what has been asked and answered.
 */
export default async function LeaguePollsPage({
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

  const membershipId = await loadMembershipId(id, user.id)
  const polls = await loadPolls(id, membershipId)
  const open = polls.filter((p) => p.status === 'open')
  const closed = polls.filter((p) => p.status !== 'open')

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Polls
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ctx.name} · every question put to the league
          </p>
        </div>
        {ctx.isCommissioner && (
          <Link
            href={`/leagues/${id}/governance/polls/new`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create poll
          </Link>
        )}
      </div>

      <GovernanceNav leagueId={id} active="polls" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Open ({open.length})
        </h2>
        <PollList leagueId={id} polls={open} emptyLabel="No open polls right now." />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Closed ({closed.length})
        </h2>
        <PollList leagueId={id} polls={closed} emptyLabel="No closed polls yet." />
      </section>
    </div>
  )
}
