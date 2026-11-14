import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Gavel, Plus, Scale, ShieldAlert } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadMembershipId } from '@/src/lib/finances'
import {
  loadGovernanceHub,
  pollsNeedingVote,
} from '@/src/lib/governance'
import { formatDate, pluralizeCount } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import GovernanceNav from './governance-nav'
import PollList from './poll-list'
import { DisputeStatusBadge } from './governance-badges'

export const dynamic = 'force-dynamic'

/**
 * Governance hub (Governance-2).
 *
 * One screen answering "what does the league need to decide, and what has it
 * already decided": open polls with live counts and time left, closed polls
 * with their outcome, the most recent decisions, and unresolved disputes.
 *
 * Access matches every other league page: `loadLeagueContext` returns null
 * for non-members and we 404 rather than 403. Governance data is league-wide
 * by design — members and the commissioner see the same polls and the same
 * decision log — so the only difference here is which write CTAs the
 * commissioner gets. Vote results are visible while a poll is open because
 * `closePoll` is the only writer of a verdict and there is no cron: hiding
 * the tally would just leave the page empty.
 */
export default async function LeagueGovernancePage({
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

  // 'Your vote' highlighting needs the viewer's membership row id; a
  // commissioner who is not also a member simply has no vote to highlight.
  const membershipId = await loadMembershipId(id, user.id)
  const hub = await loadGovernanceHub(id, membershipId)
  const awaiting = pollsNeedingVote(hub.openPolls)
  const openDisputes = hub.disputes.filter((d) => d.status === 'open')

  const stats = [
    { label: 'Open polls', value: hub.openPolls.length },
    { label: 'Awaiting your vote', value: awaiting.length },
    { label: 'Decisions', value: hub.decisions.length, muted: true },
    { label: 'Open disputes', value: openDisputes.length },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {ctx.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            League governance — polls, binding votes, decisions and disputes
          </p>
        </div>
        {ctx.isCommissioner && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/leagues/${id}/governance/polls/new`}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create poll
            </Link>
            <Link
              href={`/leagues/${id}/governance/decisions/new`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Gavel className="h-4 w-4" />
              Record decision
            </Link>
            <Link
              href={`/leagues/${id}/governance/disputes/new`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ShieldAlert className="h-4 w-4" />
              Log dispute
            </Link>
          </div>
        )}
      </div>

      <GovernanceNav leagueId={id} active="overview" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Open polls */}
      <section className="space-y-3">
        <SectionHeading
          title="Open polls"
          hint="Vote counts update as members cast ballots"
        />
        <PollList
          leagueId={id}
          polls={hub.openPolls}
          emptyLabel="No open polls. The commissioner can start one with “Create poll”."
        />
      </section>

      {/* Closed polls */}
      <section className="space-y-3">
        <SectionHeading title="Closed polls" hint="Outcome shown against each threshold" />
        <PollList
          leagueId={id}
          polls={hub.closedPolls.slice(0, 5)}
          emptyLabel="No closed polls yet."
        />
        {hub.closedPolls.length > 5 && (
          <Link
            href={`/leagues/${id}/governance/polls`}
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            See all {pluralizeCount(hub.closedPolls.length, 'closed poll')}
          </Link>
        )}
      </section>

      {/* Recent decisions */}
      <section className="space-y-3">
        <SectionHeading title="Recent decisions" />
        {hub.decisions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
            No decisions recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {hub.decisions.map((decision) => (
              <li
                key={decision.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {decision.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {decision.description}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                    <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                    {decision.outcome}
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatDate(new Date(decision.recordedAt))} · {decision.recordedByName}
                  {decision.pollId && decision.pollTitle ? (
                    <>
                      {' · from poll '}
                      <Link
                        href={`/leagues/${id}/governance/polls/${decision.pollId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {decision.pollTitle}
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/leagues/${id}/governance/decisions`}
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Full decision log
        </Link>
      </section>

      {/* Open disputes */}
      <section className="space-y-3">
        <SectionHeading title="Open disputes" />
        {openDisputes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing disputed. Good.
          </p>
        ) : (
          <ul className="space-y-2">
            {openDisputes.slice(0, 3).map((dispute) => (
              <li key={dispute.id} className="rounded-2xl border border-border bg-card p-4">
                <DisputeStatusBadge status={dispute.status} />
                <p className="mt-2 line-clamp-3 text-sm text-foreground">
                  {dispute.description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Raised by {dispute.raisedByName} · {formatDate(new Date(dispute.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/leagues/${id}/governance/disputes`}
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          All disputes ({hub.disputes.length})
        </Link>
      </section>
    </div>
  )
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
