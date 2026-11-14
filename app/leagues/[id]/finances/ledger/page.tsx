import { createClient } from '@/src/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Scale } from 'lucide-react'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { loadFinancesLedger, loadMembershipId } from '@/src/lib/finances'
import type { LedgerEntryView } from '@/src/lib/finances'
import { formatMoney } from '@/src/lib/display'
import { isUuid } from '@/src/lib/invitations'
import FinancesNav from '../finances-nav'
import StatusBadge from '../status-badge'

export const dynamic = 'force-dynamic'

/** 'Mar 4, 2026, 3:12 PM' — accountants want the exact moment, not "2d ago". */
function formatLedgerTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

/**
 * Full chronological ledger (Finances-2).
 *
 * Built from financial data — every obligation (creation event) and every
 * payment (with recorder, status, notes) — oldest first, with a running
 * balance column so anyone can reconstruct who claimed what, when. The
 * activity feed is the league's audit trail; this is money's.
 *
 * Visibility mirrors the hub: the commissioner sees every entry; a member
 * only entries about their own obligations. Scoping happens in the read
 * query (loadFinancesLedger member filter) — not by hiding rows client-side.
 */
export default async function LeagueLedgerPage({
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

  let memberId: string | null = null
  if (!ctx.isCommissioner) {
    memberId = await loadMembershipId(id, user.id)
    if (!memberId) notFound()
  }

  const entries = await loadFinancesLedger(id, { memberId })

  // Running balance (what's still owed): obligations add, received payments
  // subtract. Integer cents — same discipline as every other total here.
  let balanceCents = 0
  const withBalances: (LedgerEntryView & { balance: number })[] = entries.map(
    (e) => {
      if (e.type === 'obligation_created') {
        balanceCents += Math.round(e.amount * 100)
      } else if (e.status === 'received') {
        balanceCents -= Math.round(e.amount * 100)
      }
      return { ...e, balance: balanceCents / 100 }
    },
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Ledger
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ctx.name} · every financial event, oldest first
          </p>
        </div>
        <Link
          href={`/leagues/${id}/finances`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to finances
        </Link>
      </div>

      <FinancesNav leagueId={id} active="ledger" />

      {!ctx.isCommissioner && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          You are seeing only events about your own obligations. The full
          league ledger is visible to the commissioner.
        </p>
      )}

      {withBalances.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No financial events yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Owed after</th>
                <th className="px-4 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {withBalances.map((e) => (
                <tr
                  key={e.entryId}
                  className="border-b border-border/60 last:border-b-0 hover:bg-accent/40"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatLedgerTimestamp(e.occurredAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {e.type === 'obligation_created' ? 'Obligation' : 'Payment'}{' '}
                      · {e.description}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {e.type === 'payment_recorded' && (
                        <StatusBadge status={e.status} />
                      )}
                      {e.notes && <span className="italic">“{e.notes}”</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.memberName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground">
                    {e.type === 'obligation_created' ? '+' : '−'}
                    {formatMoney(e.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                    {formatMoney(e.balance)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {e.actorName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
