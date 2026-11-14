'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, X } from 'lucide-react'
import { recordPayment } from '@/app/actions/finances'
import type { FinancesObligationView } from '@/src/lib/finances'

/**
 * Inline "Record payment" form (Finances-2, commissioner only).
 *
 * NO payment processing here, and deliberately none anywhere in finances:
 * this records that money already moved outside the app (cash, Venmo, a
 * haircut) — it can only ever insert a bookkeeping row. Amount prefills with
 * what's still outstanding; notes optional. Submit calls the recordPayment
 * server action, which re-checks authorization and writes the payment.
 */
export default function RecordPaymentForm({
  obligation,
  onDone,
}: {
  obligation: FinancesObligationView
  onDone: () => void
}) {
  const router = useRouter()
  const remaining = Math.max(0, obligation.amount - obligation.paidAmount)
  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive amount.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await recordPayment(obligation.id, {
        amount: parsed,
        notes: notes.trim() || undefined,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Record payment</h4>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close payment form"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Money was paid outside the app — this logs it against “
        {obligation.description}”.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="block text-xs font-medium text-muted-foreground">
          Amount ($)
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Notes (optional)
          <input
            type="text"
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Cash at the drafts party…"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-50"
      >
        <BadgeCheck className="mr-2 h-4 w-4" />
        {pending ? 'Recording…' : 'Save payment'}
      </button>
    </div>
  )
}
