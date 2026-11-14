import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { loadLeagueContext } from '@/src/lib/dashboard'
import {
  loadFinancesOverview,
  loadMembershipId,
} from '@/src/lib/finances'
import { formatMoney } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import FinancesNav from './finances-nav'
import ObligationsList from './obligations-list'
import { Scale, Wallet } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Finances hub (Finances-2): obligations ledger with totals.
 *
 * Visibility rules:
 *  - Commissioner sees the full picture — every member's obligations and
 *    league-wide totals.
 *  - A plain member sees only their own obligations and their own totals.
 *    Scoping happens in the read query (loadFinancesOverview member filter),
 *    not by hiding rows client-side — other members' data never enters the
 *    payload.
 *
 * Access: identical gate to every league page — loadLeagueContext returns
 * null for non-members and we 404 rather than 403.
 */
export default async function LeagueFinancesPage({
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

  // Member scope: resolve the viewer's membership row; a commissioner-but-
  // not-member (the leagues.commissioner_id source of truth) sees everything.
  let memberId: string | null = null
  if (!ctx.isCommissioner) {
    memberId = await loadMembershipId(id, user.id)
    if (!memberId) notFound() // loadLeagueContext said member; keep types honest
  }

  const overview = await loadFinancesOverview(id, { memberId })
  const stats = [
    { label: 'Total owed', value: overview.totals.totalOwed },
    { label: 'Total received', value: overview.totals.totalReceived },
    { label: 'Outstanding', value: overview.totals.outstanding },
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
            {ctx.isCommissioner
              ? 'League finances — recordkeeping only, no payments move through the app'
              : 'Your league obligations'}
          </p>
        </div>
        {ctx.isCommissioner && (
          <Link
            href={`/leagues/${id}/finances/new`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            <Wallet className="mr-2 h-4 w-4" />
            New obligation
          </Link>
        )}
      </div>

      <FinancesNav leagueId={id} active="overview" />

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
              {formatMoney(stat.value)}
            </p>
          </div>
        ))}
      </div>

      {!ctx.isCommissioner && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          You are viewing your own obligations only. League-wide totals are
          visible to the commissioner.
        </p>
      )}

      <ObligationsList
        obligations={overview.obligations}
        isCommissioner={ctx.isCommissioner}
      />
    </div>
  )
}
