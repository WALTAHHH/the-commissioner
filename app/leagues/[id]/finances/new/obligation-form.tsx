'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, User } from 'lucide-react'
import { createObligation, createBulkObligations } from '@/app/actions/finances'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormMessage } from '@/components/ui/form-message'
import { SubmitButton } from '@/components/ui/submit-button'

type MemberOption = { memberId: string; displayName: string }
type CategoryOption = { id: string; name: string; type: string }

/**
 * Create-obligation form (Finances-2).
 *
 * Single mode creates one obligation for one member; bulk mode creates the
 * same obligation for a picked set (or everyone — the common season-dues
 * case). Submit calls createObligation / createBulkObligations, which
 * re-check authorization, validate the ids against the league, and insert
 * atomically for bulk (all-or-nothing).
 *
 * `payment_instructions` is plain text only: what the member should do to
 * settle up outside the app. Nothing here can initiate a payment.
 *
 * Local validation renders in the offending field's error slot; server-side
 * failures render as one banner before the actions.
 */
type FieldKey = 'member' | 'description' | 'amount'

interface FormError {
  message: string
  field?: FieldKey
}

export default function ObligationForm({
  leagueId,
  members,
  categories,
}: {
  leagueId: string
  members: MemberOption[]
  categories: CategoryOption[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [memberId, setMemberId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState<FormError | null>(null)
  const [pending, startTransition] = useTransition()

  const allSelected = members.length > 0 && selectedIds.size === members.length
  const fieldError = (key: FieldKey) =>
    error?.field === key ? error.message : null

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(members.map((m) => m.memberId)))
  }

  function submit() {
    setError(null)
    if (!description.trim()) {
      setError({ message: 'Description is required.', field: 'description' })
      return
    }
    const parsed = Number(amount)
    if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setError({ message: 'Amount must be a positive number.', field: 'amount' })
      return
    }
    if (mode === 'single' && !memberId) {
      setError({ message: 'Pick a member.', field: 'member' })
      return
    }
    if (mode === 'bulk' && selectedIds.size === 0) {
      setError({ message: 'Pick at least one member.', field: 'member' })
      return
    }

    const fields = {
      amount: parsed,
      description: description.trim(),
      categoryId: categoryId || undefined,
      dueDate: dueDate || undefined,
      paymentInstructions: instructions.trim() || undefined,
    }

    startTransition(async () => {
      const result =
        mode === 'single'
          ? await createObligation(leagueId, { ...fields, memberId })
          : await createBulkObligations(leagueId, {
              ...fields,
              memberIds: Array.from(selectedIds),
            })
      if (result.error) {
        setError({ message: result.error })
        return
      }
      router.push(`/leagues/${leagueId}/finances`)
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="mx-auto w-full max-w-2xl space-y-6"
    >
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            { key: 'single', label: 'One member', icon: <User className="h-4 w-4" /> },
            { key: 'bulk', label: 'Multiple members', icon: <Users className="h-4 w-4" /> },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            aria-pressed={mode === option.key}
            disabled={pending}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60 ${
              mode === option.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        {/* Member picker */}
        {mode === 'single' ? (
          <Field
            label="Member"
            htmlFor="obligation-member"
            hint="Who owes this."
            error={fieldError('member')}
          >
            <Select
              id="obligation-member"
              value={memberId}
              disabled={pending}
              onChange={(e) => setMemberId(e.target.value)}
              aria-invalid={fieldError('member') ? true : undefined}
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            label={
              <>
                Members{' '}
                <span className="font-normal text-muted-foreground">
                  ({selectedIds.size} of {members.length})
                </span>
              </>
            }
            hint="Pick everyone who owes the same amount."
            error={fieldError('member')}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-muted-foreground">Selected members</span>
              <button
                type="button"
                onClick={toggleAll}
                disabled={pending || members.length === 0}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-input bg-transparent px-2 py-1.5">
              {members.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">
                  No active members yet.
                </p>
              )}
              {members.map((m) => (
                <label
                  key={m.memberId}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.memberId)}
                    onChange={() => toggleMember(m.memberId)}
                    disabled={pending}
                    className="h-4 w-4 shrink-0 rounded border-input accent-[var(--primary)]"
                  />
                  <span className="min-w-0 break-words">{m.displayName}</span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field
          label="Description"
          htmlFor="obligation-description"
          hint="What this charge is for."
          error={fieldError('description')}
        >
          <Input
            id="obligation-description"
            type="text"
            maxLength={500}
            value={description}
            disabled={pending}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Season dues"
            aria-invalid={fieldError('description') ? true : undefined}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Amount ($)"
            htmlFor="obligation-amount"
            error={fieldError('amount')}
          >
            <Input
              id="obligation-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              disabled={pending}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.00"
              aria-invalid={fieldError('amount') ? true : undefined}
            />
          </Field>
          <Field
            label="Category (optional)"
            htmlFor="obligation-category"
            hint="Groups this in the ledger."
          >
            <Select
              id="obligation-category"
              value={categoryId}
              disabled={pending}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Due date (optional)"
          htmlFor="obligation-due"
          hint="Overdue obligations are flagged in the ledger."
        >
          <Input
            id="obligation-due"
            type="date"
            value={dueDate}
            disabled={pending}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>

        <Field
          label="Payment instructions (optional)"
          htmlFor="obligation-instructions"
          hint="Notes only. The app never moves money and never links out to a payment service."
        >
          <Textarea
            id="obligation-instructions"
            maxLength={1000}
            rows={3}
            value={instructions}
            disabled={pending}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="How the member should settle up — plain text the commissioner and member can read."
          />
        </Field>
      </div>

      {error && !error.field && <FormMessage>{error.message}</FormMessage>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <SubmitButton loading={pending} className="w-full sm:w-auto">
          {mode === 'single'
            ? 'Create obligation'
            : `Create for ${selectedIds.size || 'all'} member${selectedIds.size === 1 ? '' : 's'}`}
        </SubmitButton>
        <SubmitButton
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full sm:w-auto"
          onClick={() => router.push(`/leagues/${leagueId}/finances`)}
        >
          Cancel
        </SubmitButton>
      </div>
    </form>
  )
}
