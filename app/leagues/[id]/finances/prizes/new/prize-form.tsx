'use client'

import { useState, useTransition, type ReactNode, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, Star, CalendarRange, Hash } from 'lucide-react'
import { createPrize } from '@/app/actions/finances'
import type { PrizeScope, PrizeType } from '@/src/db/schema/finances'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SubmitButton } from '@/components/ui/submit-button'
import { FormMessage } from '@/components/ui/form-message'

type MemberOption = { memberId: string; displayName: string }

const WEEK_MAX = 40
const PLACE_MAX = 100

/** Two-option segmented control, shared style with the obligation form. */
function ToggleGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { key: T; label: string; icon: ReactNode }[]
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <p className="block text-sm font-medium text-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${
              value === option.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Add-prize form. The commissioner describes a prize along two axes — payout
 * vs recognition, season-end vs a given week — and may optionally attach a
 * winner now (otherwise it stays TBD and is awarded later). Fields the axis
 * doesn't need are hidden: no amount for recognition, no place for weekly.
 *
 * Submits to createPrize, which re-checks commissioner permission, applies the
 * same validation, and inserts the row.
 */
export default function PrizeForm({
  leagueId,
  seasonYear,
  members,
}: {
  leagueId: string
  seasonYear: number
  members: MemberOption[]
}) {
  const router = useRouter()
  const [type, setType] = useState<PrizeType>('payout')
  const [scope, setScope] = useState<PrizeScope>('season')
  const [placeChoice, setPlaceChoice] = useState<'1' | '2' | '3' | 'custom'>('1')
  const [customPlace, setCustomPlace] = useState('')
  const [weekNumber, setWeekNumber] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [winnerId, setWinnerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isPayout = type === 'payout'
  const isWeekly = scope === 'weekly'

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!description.trim()) {
      setError('Description is required.')
      return
    }

    let place: number | null = null
    let week: number | null = null
    if (isWeekly) {
      const w = Number(weekNumber)
      if (!weekNumber.trim() || !Number.isInteger(w) || w < 1 || w > WEEK_MAX) {
        setError(`Week number must be a whole number between 1 and ${WEEK_MAX}.`)
        return
      }
      week = w
    } else {
      if (placeChoice === 'custom') {
        const p = Number(customPlace)
        if (
          !customPlace.trim() ||
          !Number.isInteger(p) ||
          p < 1 ||
          p > PLACE_MAX
        ) {
          setError(`Place must be a whole number between 1 and ${PLACE_MAX}.`)
          return
        }
        place = p
      } else {
        place = Number(placeChoice)
      }
      if (isPayout && place == null) {
        setError('Season payouts need a finishing place.')
        return
      }
    }

    let amountValue: number | null = null
    if (isPayout) {
      const a = Number(amount)
      if (!amount.trim() || !Number.isFinite(a) || a <= 0) {
        setError('Amount must be a positive number.')
        return
      }
      amountValue = a
    }

    startTransition(async () => {
      const result = await createPrize(leagueId, {
        seasonYear,
        scope,
        type,
        place,
        weekNumber: week,
        description: description.trim(),
        amount: amountValue,
        winnerId: winnerId || undefined,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/leagues/${leagueId}/finances/prizes`)
    })
  }

  function cancel() {
    router.push(`/leagues/${leagueId}/finances/prizes`)
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-6">
      <ToggleGroup
        label="Prize type"
        value={type}
        onChange={setType}
        disabled={pending}
        options={[
          {
            key: 'payout',
            label: 'Payout ($)',
            icon: <DollarSign className="h-4 w-4" />,
          },
          {
            key: 'recognition',
            label: 'Recognition',
            icon: <Star className="h-4 w-4" />,
          },
        ]}
      />

      <ToggleGroup
        label="When"
        value={scope}
        onChange={setScope}
        disabled={pending}
        options={[
          {
            key: 'season',
            label: 'Season-end',
            icon: <CalendarRange className="h-4 w-4" />,
          },
          {
            key: 'weekly',
            label: 'Weekly',
            icon: <Hash className="h-4 w-4" />,
          },
        ]}
      />

      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        {isWeekly ? (
          <Field
            label="Week number"
            htmlFor="prize-week"
            hint={`Between 1 and ${WEEK_MAX}. This prize is awarded for that week.`}
          >
            <Input
              id="prize-week"
              type="number"
              min="1"
              max={String(WEEK_MAX)}
              step="1"
              inputMode="numeric"
              value={weekNumber}
              disabled={pending}
              onChange={(e) => setWeekNumber(e.target.value)}
              placeholder="4"
            />
          </Field>
        ) : (
          <div className="space-y-4">
            <Field label="Place" htmlFor="prize-place" hint="Required for a season payout; optional for a recognition award.">
              <Select
                id="prize-place"
                value={placeChoice}
                disabled={pending}
                onChange={(e) =>
                  setPlaceChoice(e.target.value as '1' | '2' | '3' | 'custom')
                }
              >
                <option value="1">1st place</option>
                <option value="2">2nd place</option>
                <option value="3">3rd place</option>
                <option value="custom">Other / custom</option>
              </Select>
            </Field>
            {placeChoice === 'custom' && (
              <Field
                label="Which place?"
                htmlFor="prize-custom-place"
                hint={`A whole number between 1 and ${PLACE_MAX}.`}
              >
                <Input
                  id="prize-custom-place"
                  type="number"
                  min="1"
                  max={String(PLACE_MAX)}
                  step="1"
                  inputMode="numeric"
                  value={customPlace}
                  disabled={pending}
                  onChange={(e) => setCustomPlace(e.target.value)}
                  placeholder="5"
                />
              </Field>
            )}
          </div>
        )}

        <Field
          label="Description"
          htmlFor="prize-description"
          hint="e.g. “League champion”, “Weekly high score”, “Golden Toilet”."
        >
          <Input
            id="prize-description"
            type="text"
            maxLength={500}
            value={description}
            disabled={pending}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Weekly high score"
          />
        </Field>

        {isPayout && (
          <Field
            label="Amount ($)"
            htmlFor="prize-amount"
            hint="What the winner is paid. Recognition awards have no amount."
          >
            <Input
              id="prize-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              disabled={pending}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.00"
            />
          </Field>
        )}

        <Field
          label="Winner (optional)"
          htmlFor="prize-winner"
          hint="Leave blank to award later — the prize will show as TBD."
        >
          <Select
            id="prize-winner"
            value={winnerId}
            disabled={pending}
            onChange={(e) => setWinnerId(e.target.value)}
          >
            <option value="">Nobody yet (TBD)</option>
            {members.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.displayName}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <FormMessage>{error}</FormMessage>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <SubmitButton type="submit" loading={pending}>
          Create prize
        </SubmitButton>
        <SubmitButton type="button" variant="outline" loading={pending} onClick={cancel}>
          Cancel
        </SubmitButton>
      </div>
    </form>
  )
}
