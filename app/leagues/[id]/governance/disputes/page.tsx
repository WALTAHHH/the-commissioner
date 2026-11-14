import { createClient } from '@/src/utils/supabase/server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Plus, ShieldAlert } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadDisputes, type DisputeView } from '@/src/lib/governance'
import { formatDate } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import GovernanceNav from '../governance-nav'
import { DisputeStatusBadge } from '../governance-badges'
import ResolveDisputeForm from './resolve-dispute-form'

export const dynamic = 'force-dynamic'

/**
 * Disputes (Governance-2) — open disputes first with a commissioner-only
 * resolve control, then the resolved record with its ruling text.
 *
 * Bucketing happens here rather than in the read layer: `loadDisputes`
 * already returns open-before-resolved, but the two shapes render
 * differently (a resolve affordance vs. a stored resolution), so the split
 * is explicit and the ordering contract is stated in one place.
 *
 * Anyone in the league can raise a dispute; only the commissioner resolves
 * one. The resolve control is rendered from `ctx.isCommissioner` for layout
 * only — `resolveDispute` re-checks authorization server-side regardless.
 */
export default async function DisputesPage({
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

  const disputes = await loadDisputes(id)
  const open = disputes.filter((d) => d.status === 'open')
  const resolved = disputes.filter((d) => d.status !== 'open')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Disputes
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ctx.name} · {open.length} open, {resolved.length} resolved
          </p>
        </div>
        <Link
          href={`/leagues/${id}/governance/disputes/new`}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Raise dispute
        </Link>
      </div>

      <GovernanceNav leagueId={id} active="disputes" />

      {disputes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No disputes on record</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Anything you want the commissioner to rule on — a trade, a lineup, a
            payout — starts here.
          </p>
          <Link
            href={`/leagues/${id}/governance/disputes/new`}
            className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ShieldAlert className="mr-2 h-4 w-4" />
            Raise a dispute
          </Link>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <SectionHeading title="Open disputes" count={open.length} />
            {open.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing disputed. Good.
              </p>
            ) : (
              <ul className="space-y-3">
                {open.map((dispute) => (
                  <DisputeCard
                    key={dispute.id}
                    dispute={dispute}
                    canResolve={ctx.isCommissioner}
                  />
                ))}
              </ul>
            )}
          </section>

          {resolved.length > 0 && (
            <section className="space-y-3">
              <SectionHeading title="Resolved disputes" count={resolved.length} />
              <ul className="space-y-3">
                {resolved.map((dispute) => (
                  <DisputeCard
                    key={dispute.id}
                    dispute={dispute}
                    canResolve={false}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </div>
  )
}

function DisputeCard({
  dispute,
  canResolve,
}: {
  dispute: DisputeView
  canResolve: boolean
}) {
  const open = dispute.status === 'open'
  return (
    <li className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <DisputeStatusBadge status={dispute.status} />
        <p className="text-xs text-muted-foreground">
          Raised by {dispute.raisedByName} · {formatDate(new Date(dispute.createdAt))}
        </p>
      </div>

      <p className="mt-3 whitespace-pre-line text-sm text-foreground">
        {dispute.description}
      </p>

      {open ? (
        canResolve ? (
          <div className="mt-4 border-t border-border pt-4">
            <ResolveDisputeForm disputeId={dispute.id} />
          </div>
        ) : (
          <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
            Waiting on the commissioner to rule.
          </p>
        )
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Resolution
          </span>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">
            {dispute.resolution ?? '—'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {dispute.resolvedByName ?? 'Commissioner'}
            {dispute.resolvedAt
              ? ` · resolved ${formatDate(new Date(dispute.resolvedAt))}`
              : ''}
          </p>
        </div>
      )}
    </li>
  )
}
