'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { deletePrizePlace, setPrizePlace } from '@/app/actions/finances'
import { formatMoney } from '@/src/lib/display'

type PrizeRow = {
  id: string
  place: number
  description: string
  amount: number
}

type Draft = {
  /** null = new place, amount not yet picked */
  place: number | null
  description: string
  amount: string
}

/** '1st', '2nd', '3rd', '11th', '21st'… */
function ordinalize(n: number): string {
  const teens = n % 100
  if (teens >= 11 && teens <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/**
 * Prize structure editor (Finances-2).
 *
 * Commissioner edits each place — rank, description ("League champion"),
 * payout — members get the same table read-only. Save calls setPrizePlace,
 * which UPSERTS on (league, season, place): editing 1st place twice updates
 * the row; taking a place number nobody used inserts it. After each write
 * router.refresh() re-renders the server-read list — this component never
 * keeps its own copy of the data, so it can't drift from the DB.
 */
export default function PrizeEditor({
  leagueId,
  seasonYear,
  prizes,
  canEdit,
}: {
  leagueId: string
  seasonYear: number
  prizes: PrizeRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [armedDelete, setArmedDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sorted = [...prizes].sort((a, b) => a.place - b.place)
  const usedPlaces = new Set(sorted.map((p) => p.place))
  const nextFreePlace = (() => {
    let n = 1
    while (usedPlaces.has(n)) n++
    return n
  })()

  function startAdd() {
    setArmedDelete(null)
    setError(null)
    setDraft({ place: nextFreePlace, description: '', amount: '' })
  }

  function startEdit(prize: PrizeRow) {
    setArmedDelete(null)
    setError(null)
    setDraft({
      place: prize.place,
      description: prize.description,
      amount: prize.amount.toFixed(2),
    })
  }

  function save() {
    if (!draft) return
    const place = draft.place
    if (place === null || !Number.isInteger(place) || place < 1 || place > 100) {
      setError('Place must be a whole number between 1 and 100.')
      return
    }
    if (!draft.description.trim()) {
      setError('Description is required.')
      return
    }
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Payout must be a positive amount.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await setPrizePlace(leagueId, {
        seasonYear,
        place,
        amount,
        description: draft.description.trim(),
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setDraft(null)
      router.refresh()
    })
  }

  function remove(prizeId: string) {
    // Two-step: the first click only arms the button, so a stray tap can't
    // wipe a prize row.
    if (armedDelete !== prizeId) {
      setArmedDelete(prizeId)
      return
    }
    setArmedDelete(null)
    setError(null)
    startTransition(async () => {
      const result = await deletePrizePlace(leagueId, prizeId)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {sorted.length === 0 && !draft && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No prizes defined for {seasonYear} yet.{' '}
            {canEdit ? 'Add 1st place to get started.' : 'Check back soon.'}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {sorted.map((prize, i) => (
          <div
            key={prize.id}
            className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
              i > 0 ? 'border-t border-border' : ''
            }`}
          >
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-bold text-foreground">
                {ordinalize(prize.place)}
              </span>
              <p className="min-w-0 truncate text-sm font-medium text-foreground">
                {prize.description}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-base font-bold text-foreground">
                {formatMoney(prize.amount)}
              </p>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(prize)}
                    className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(prize.id)}
                    disabled={pending}
                    className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      armedDelete === prize.id
                        ? 'bg-destructive text-destructive-foreground'
                        : 'border border-destructive/30 text-destructive hover:bg-destructive/10'
                    }`}
                  >
                    {armedDelete === prize.id ? (
                      <>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Confirm delete
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {draft && (
          <div
            className={`space-y-3 border-t border-border bg-muted/40 p-4 sm:p-5 ${
              sorted.length > 0 ? '' : 'border-t-0'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {draft.place === null ? 'New prize place' : `Prize ${draft.place !== null ? ordinalize(draft.place) : ''}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDraft(null)
                  setError(null)
                }}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Cancel prize edit"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr_9rem]">
              <label className="block text-xs font-medium text-muted-foreground">
                Place
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={draft.place ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      place: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Description
                <input
                  type="text"
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="League champion"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Payout ($)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  placeholder="100.00"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save prize'}
            </button>
          </div>
        )}
      </div>

      {canEdit && !draft && sorted.length > 0 && (
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add prize place
        </button>
      )}
    </div>
  )
}
