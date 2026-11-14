'use client'

import { useMemo, useState } from 'react'
import { BadgeCheck, ChevronDown } from 'lucide-react'
import type { FinancesObligationView } from '@/src/lib/finances'
import { formatMoney } from '@/src/lib/display'
import RecordPaymentForm from './record-payment-form'
import StatusBadge from './status-badge'

/**
 * The obligations list (Finances-2 hub).
 *
 * Commissioner: every obligation in the league. Member: only their own
 * (the page scopes the query before this ever sees data). Rows grouped by
 * member or by category — grouping is pure client state over the flat
 * payload, so the toggle costs no round trip. Each row expands payment
 * history; "Record payment" is inline and commissioner-only.
 */
export default function ObligationsList({
  obligations,
  isCommissioner,
}: {
  obligations: FinancesObligationView[]
  isCommissioner: boolean
}) {
  const [grouping, setGrouping] = useState<'member' | 'category'>('member')
  const [openPaymentFor, setOpenPaymentFor] = useState<string | null>(null)
  const [expandedPaymentsFor, setExpandedPaymentsFor] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, FinancesObligationView[]>()
    for (const o of obligations) {
      const key =
        grouping === 'member'
          ? o.memberName
          : o.categoryName ?? 'Uncategorized'
      const list = map.get(key)
      if (list) list.push(o)
      else map.set(key, [o])
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [obligations, grouping])

  if (obligations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No obligations yet.{' '}
          {isCommissioner
            ? 'Create one to start tracking dues, bets, and penalties.'
            : 'Nothing is owed to the league right now.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Grouping toggle */}
      <div className="flex items-center justify-between">
        <div
          className="inline-flex rounded-lg border border-border bg-card p-1 text-sm"
          role="group"
          aria-label="Group obligations by"
        >
          {(['member', 'category'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGrouping(mode)}
              className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                grouping === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              By {mode}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {obligations.length} obligation{obligations.length === 1 ? '' : 's'}
        </p>
      </div>

      {groups.map(([name, items]) => {
        const groupOwed = items.reduce((acc, o) => acc + o.amount, 0)
        return (
          <section key={name} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {name}
              </h3>
              {isCommissioner && (
                <p className="text-xs text-muted-foreground">
                  {formatMoney(groupOwed)} owed
                </p>
              )}
            </div>

            <div className="space-y-3">
              {items.map((o) => {
                const remaining = Math.max(0, o.amount - o.paidAmount)
                const hasHistory = o.payments.length > 0
                return (
                  <article
                    key={o.id}
                    className="rounded-2xl border border-border bg-card p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold text-foreground">
                            {o.description}
                          </h4>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {isCommissioner && <span>{o.memberName}</span>}
                          {o.categoryName && <span>{o.categoryName}</span>}
                          {o.dueDate && (
                            <span>Due {formatDueDate(o.dueDate)}</span>
                          )}
                          {o.paymentInstructions && (
                            <span className="italic">
                              Instructions: {o.paymentInstructions}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">
                            {formatMoney(o.amount)}
                          </p>
                          {o.paidAmount > 0 && o.status !== 'received' && (
                            <p className="text-xs text-muted-foreground">
                              {formatMoney(remaining)} remaining
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {hasHistory && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPaymentsFor(
                                  expandedPaymentsFor === o.id ? null : o.id,
                                )
                              }
                              className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <ChevronDown
                                className={`mr-1 h-3.5 w-3.5 transition-transform ${
                                  expandedPaymentsFor === o.id ? 'rotate-180' : ''
                                }`}
                              />
                              {o.payments.length} payment
                              {o.payments.length === 1 ? '' : 's'}
                            </button>
                          )}
                          {isCommissioner && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenPaymentFor(
                                  openPaymentFor === o.id ? null : o.id,
                                )
                              }
                              className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                              Record payment
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {openPaymentFor === o.id && (
                      <RecordPaymentForm
                        obligation={o}
                        onDone={() => setOpenPaymentFor(null)}
                      />
                    )}

                    {expandedPaymentsFor === o.id && hasHistory && (
                      <ul className="mt-3 space-y-1 border-t border-border pt-3">
                        {o.payments
                          .slice()
                          .reverse()
                          .map((p) => (
                            <li
                              key={p.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
                            >
                              <span>
                                {p.notes ? `“${p.notes}” — ` : ''}
                                recorded by {p.recordedByName}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {formatMoney(p.amount)}
                                </span>
                                <StatusBadge status={p.status} />
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** 'YYYY-MM-DD' without the UTC-shift trap of new Date('YYYY-MM-DD'). */
function formatDueDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
