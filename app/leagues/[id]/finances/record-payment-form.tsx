'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { recordPayment } from '@/app/actions/finances'
import type { FinancesObligationView } from '@/src/lib/finances'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

/**
 * Inline "Record payment" form (Finances-2, commissioner only).
 *
 * NO payment processing here, and deliberately none anywhere in finances:
 * this records that money already moved outside the app (cash, Venmo, a
 * haircut) — it can only ever insert a bookkeeping row. Amount prefills with
 * what's still outstanding; notes optional. Submit calls the recordPayment
 * server action, which re-checks authorization and writes the payment.
 *
 * Bad amount input renders in the amount field's error slot; server-side
 * failures render as a banner before the actions.
 */
interface FormError {
  message: string
  field?: 'amount'
}

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
  const [error, setError] = useState<FormError | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError({ message: 'Enter a positive amount.', field: 'amount' })
      return
    }
    startTransition(async () => {
      const result = await recordPayment(obligation.id, {
        amount: parsed,
        notes: notes.trim() || undefined,
      })
      if (result.error) {
        setError({ message: result.error })
        return
      }
      router.refresh()
      onDone()
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="mt-3 rounded-xl border border-border bg-muted/40 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">Record payment</h4>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          aria-label="Close payment form"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 break-words text-xs text-muted-foreground">
        Money was paid outside the app — this logs it against “
        {obligation.description}”.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <Field
          label="Amount ($)"
          htmlFor={`payment-amount-${obligation.id}`}
          error={error?.field === 'amount' ? error.message : null}
        >
          <Input
            id={`payment-amount-${obligation.id}`}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            disabled={pending}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={error?.field === 'amount' ? true : undefined}
          />
        </Field>
        <Field
          label="Notes (optional)"
          htmlFor={`payment-notes-${obligation.id}`}
        >
          <Input
            id={`payment-notes-${obligation.id}`}
            type="text"
            maxLength={1000}
            value={notes}
            disabled={pending}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Cash at the drafts party…"
          />
        </Field>
      </div>

      {error && !error.field && <FormMessage className="mt-3">{error.message}</FormMessage>}

      <SubmitButton loading={pending} className="mt-3">Save payment</SubmitButton>
    </form>
  )
}
