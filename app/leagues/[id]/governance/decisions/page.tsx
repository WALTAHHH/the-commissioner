import { createClient } from '@/src/utils/supabase/server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { FileText, Plus, Gavel } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadDecisions } from '@/src/lib/governance'
import { formatDate } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import GovernanceNav from '../governance-nav'

export const dynamic = 'force-dynamic'

/**
 * Decision log (Governance-2) — the league's list of verdicts, newest first.
 *
 * A decision is authoritative no matter where it came from, so auto-recorded
 * and hand-written entries share one list and are told apart by who recorded
 * it: `closePoll` attributes its rows to the commissioner who closed the
 * vote (identical to the human path), and `recordDecision` never sets
 * `poll_id` for an un-linked entry, so the poll chip is the reliable marker
 * of "this came from a vote".
 */
export default async function DecisionsPage({
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

  const decisions = await loadDecisions(id)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Decisions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ctx.name} · every verdict the commission has recorded, newest first
          </p>
        </div>
        {ctx.isCommissioner && (
          <Link
            href={`/leagues/${id}/governance/decisions/new`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Record decision
          </Link>
        )}
      </div>

      <GovernanceNav leagueId={id} active="decisions" />

      {decisions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No decisions recorded yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx.isCommissioner
              ? 'Record a verdict from a closed poll, or write one directly.'
              : 'When the commissioner records a verdict it will appear here.'}
          </p>
          {ctx.isCommissioner && (
            <Link
              href={`/leagues/${id}/governance/decisions/new`}
              className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Gavel className="mr-2 h-4 w-4" />
              Record a decision
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {decisions.map((decision) => (
            <li
              key={decision.id}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <h2 className="min-w-0 flex-1 text-base font-semibold text-foreground">
                  {decision.title}
                </h2>
                <div className="flex shrink-0 items-center gap-2">
                  {decision.pollId && decision.pollTitle && (
                    <Link
                      href={`/leagues/${id}/governance/polls/${decision.pollId}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      From “{decision.pollTitle}” →
                    </Link>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(new Date(decision.recordedAt))}
                  </span>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {decision.description}
              </p>

              <div className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Outcome
                </span>
                <span className="mt-1 block text-sm font-medium text-foreground">
                  {decision.outcome}
                </span>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Recorded by {decision.recordedByName}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
