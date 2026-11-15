import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Lock,
  Receipt,
} from 'lucide-react'
import { formatDate, formatMoney, pluralizeCount, prettifyLabel } from '@/src/lib/display'
import {
  isOverdue,
  toIsoDay,
  type MemberObligationsSectionView,
} from '@/src/lib/member-obligations'
import type { FinancesObligationView } from '@/src/lib/finances'
import StatusBadge from '../../finances/status-badge'

/**
 * Member profile → Obligations.
 *
 * A self-contained server component: it takes ids only and renders its own
 * empty / restricted / populated states, so the profile page never has to know
 * how obligations are loaded. The page must read the response of
 * `loadMemberObligationsSection` — this component exists to render that view,
 * not to fetch it.
 *
 * Read-only by design. Recording payments, editing and reminders live in the
 * finances hub (the spec's single write surface for money); this section links
 * there instead of growing a second one.
 */
export default function MemberObligationsSection({
  leagueId,
  memberName,
  view,
}: {
  leagueId: string
  /** Used in copy only ("Reyes has no obligations…"). */
  memberName: string
  view: MemberObligationsSectionView
}) {
  return (
    <section id="obligations" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className="text-muted-foreground" aria-hidden="true">
            <Receipt className="h-5 w-5" />
          </span>
          Obligations
        </h2>
        <span className="text-xs text-muted-foreground">
          {view.state === 'visible'
            ? pluralizeCount(view.obligations.length, 'record')
            : 'Restricted'}
        </span>
      </div>

      {view.state === 'restricted' ? (
        <RestrictedPanel reason={view.reason} leagueId={leagueId} />
      ) : (
        <VisiblePanel leagueId={leagueId} memberName={memberName} view={view} />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Restricted
// ---------------------------------------------------------------------------

function RestrictedPanel({
  reason,
  leagueId,
}: {
  reason: 'admin_only' | 'not_shared'
  leagueId: string
}) {
  const message =
    reason === 'admin_only'
      ? 'This league keeps its finances with the commissioner. Financial records are hidden from member profiles.'
      : "This league doesn't share member finances. You can see your own obligations on the finances page."

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">Financial details are private</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          <Link
            href={`/leagues/${leagueId}/finances`}
            className="mt-3 inline-flex items-center text-sm font-medium text-foreground hover:underline"
          >
            Go to finances
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Visible
// ---------------------------------------------------------------------------

function VisiblePanel({
  leagueId,
  memberName,
  view,
}: {
  leagueId: string
  memberName: string
  view: Extract<MemberObligationsSectionView, { state: 'visible' }>
}) {
  const { obligations, totals, overdue, scope, currency } = view
  const today = toIsoDay(new Date())

  if (obligations.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
        <span className="text-muted-foreground/70" aria-hidden="true">
          <Receipt className="h-5 w-5" />
        </span>
        {scope === 'own'
          ? 'You have no financial obligations on record in this league.'
          : `${memberName} has no financial obligations on record.`}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Totals — the three numbers that answer "what do they owe?" */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Total label="Total owed" value={formatMoney(totals.totalOwed)} />
        <Total label="Received" value={formatMoney(totals.totalReceived)} tone="success" />
        <Total
          label="Outstanding"
          value={formatMoney(totals.outstanding)}
          tone={totals.outstanding > 0 ? 'warning' : undefined}
        />
      </div>

      {overdue.count > 0 ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {overdue.count === 1 ? '1 obligation is' : `${overdue.count} obligations are`} past
            due — {formatMoney(overdue.amount)} still outstanding.
          </span>
        </p>
      ) : null}

      <ul className="space-y-3">
        {obligations.map((o) => (
          <ObligationCard key={o.id} obligation={o} today={today} />
        ))}
      </ul>

      {view.leaguePaymentInstructions ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            How to pay
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">
            {view.leaguePaymentInstructions}
          </p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {scope === 'full' ? (
          <>
            <Link
              href={`/leagues/${leagueId}/finances`}
              className="font-medium text-foreground hover:underline"
            >
              Open the finances hub
            </Link>{' '}
            to record a payment or send a reminder.
          </>
        ) : (
          <>
            Payments are recorded by the commissioner.{' '}
            <Link
              href={`/leagues/${leagueId}/finances`}
              className="font-medium text-foreground hover:underline"
            >
              See your finances
            </Link>{' '}
            for the league-wide ledger view.
          </>
        )}
        {currency !== 'USD' ? ` Amounts shown in ${currency}.` : ''}
      </p>
    </div>
  )
}

function Total({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'warning' | 'success'
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-warning'
      : tone === 'success'
        ? 'text-success'
        : 'text-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

/**
 * One obligation. Payment history is always rendered (not behind client
 * state) so the section stays a server component with zero JS — the profile
 * is a record you read, not a console you operate.
 */
function ObligationCard({
  obligation,
  today,
}: {
  obligation: FinancesObligationView
  today: string
}) {
  const remaining = Math.max(0, obligation.amount - obligation.paidAmount)
  const late = isOverdue(obligation, today)
  const payments = obligation.payments.slice().reverse()

  return (
    <li className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{obligation.description}</h3>
            <StatusBadge status={obligation.status} />
            {late ? (
              <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                Overdue
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {obligation.categoryName ? <span>{obligation.categoryName}</span> : null}
            {obligation.dueDate ? (
              <span className={late ? 'font-medium text-destructive' : undefined}>
                Due {formatPlainDate(obligation.dueDate)}
              </span>
            ) : (
              <span>No due date</span>
            )}
            {payments.length > 0 ? <span>{pluralizeCount(payments.length, 'payment')}</span> : null}
          </div>
          {obligation.paymentInstructions ? (
            <p className="mt-1 text-xs italic text-muted-foreground">
              {obligation.paymentInstructions}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-lg font-bold text-foreground">{formatMoney(obligation.amount)}</p>
          <p className="text-xs text-muted-foreground">
            {obligation.paidAmount > 0
              ? `${formatMoney(remaining)} remaining`
              : 'Nothing received yet'}
          </p>
        </div>
      </div>

      {payments.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span className="min-w-0">
                {p.notes ? `“${p.notes}” — ` : ''}
                {prettifyLabel(p.status)} · recorded by {p.recordedByName} on{' '}
                {formatDate(new Date(p.recordedAt))}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">{formatMoney(p.amount)}</span>
                <StatusBadge status={p.status} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** 'YYYY-MM-DD' without the UTC-shift trap of new Date('YYYY-MM-DD'). */
function formatPlainDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return formatDate(new Date(Date.UTC(y, m - 1, d)))
}
