'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, User, Loader2 } from 'lucide-react'
import { createObligation, createBulkObligations } from '@/app/actions/finances'

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
 */
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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const allSelected = members.length > 0 && selectedIds.size === members.length

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
      setError('Description is required.')
      return
    }
    const parsed = Number(amount)
    if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setError('Amount must be a positive number.')
      return
    }
    if (mode === 'single' && !memberId) {
      setError('Pick a member.')
      return
    }
    if (mode === 'bulk' && selectedIds.size === 0) {
      setError('Pick at least one member.')
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
        setError(result.error)
        return
      }
      router.push(`/leagues/${leagueId}/finances`)
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
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
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
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
          <label className="block text-sm font-medium text-foreground">
            Member
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                Members{' '}
                <span className="font-normal text-muted-foreground">
                  ({selectedIds.size} of {members.length})
                </span>
              </p>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
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
                    className="h-4 w-4 rounded border-border accent-current"
                  />
                  {m.displayName}
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="block text-sm font-medium text-foreground">
          Description
          <input
            type="text"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Season dues"
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </label>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Amount ($)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.00"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Category (optional)
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-foreground">
          Due date (optional)
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </label>

        <label className="block text-sm font-medium text-foreground">
          Payment instructions (optional)
          <textarea
            maxLength={1000}
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="How the member should settle up — plain text the commissioner and member can read."
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Notes only. The app never moves money and never links out to a
            payment service.
          </span>
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : mode === 'single' ? 'Create obligation' : `Create for ${selectedIds.size || 'all'} member${selectedIds.size === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/leagues/${leagueId}/finances`)}
          className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent sm:w-auto"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
