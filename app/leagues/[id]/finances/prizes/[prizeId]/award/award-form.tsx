'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign } from 'lucide-react'
import { awardPrize } from '@/app/actions/finances'
import { formatMoney } from '@/src/lib/display'
import type { PrizeView } from '@/src/lib/finances'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { SubmitButton } from '@/components/ui/submit-button'
import { FormMessage } from '@/components/ui/form-message'

type MemberOption = { memberId: string; displayName: string }

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
 * Award-prize form. The commissioner picks the winner from the member list.
 * For a payout prize they can also ask the app to log the money owed — this
 * creates a `financial_obligation` for the prize amount against the winner
 * (recordkeeping only; the app never moves money). Re-awarding overwrites the
 * previous winner.
 */
export default function AwardForm({
  leagueId,
  prize,
  members,
}: {
  leagueId: string
  prize: PrizeView
  members: MemberOption[]
}) {
  const router = useRouter()
  const [winnerId, setWinnerId] = useState(prize.winnerMemberId ?? '')
  const [createObligation, setCreateObligation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const scopeTag =
    prize.scope === 'weekly'
      ? prize.weekNumber != null
        ? `Week ${prize.weekNumber}`
        : 'Weekly'
      : prize.place != null
        ? ordinalize(prize.place)
        : 'Season'

  const canPayout =
    prize.type === 'payout' && prize.amount != null && prize.amount > 0

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!winnerId) {
      setError('Pick the winner.')
      return
    }
    startTransition(async () => {
      const result = await awardPrize(prize.id, {
        winnerId,
        createObligation: canPayout && createObligation,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/leagues/${leagueId}/finances/prizes`)
    })
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-6">
      {/* Prize being awarded */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {scopeTag}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              prize.type === 'payout'
                ? 'bg-primary/10 text-primary'
                : 'bg-violet-500/10 text-violet-600'
            }`}
          >
            {prize.type === 'payout' ? 'Payout' : 'Recognition'}
          </span>
        </div>
        <p className="mt-2 text-base font-semibold text-foreground">
          {prize.description}
        </p>
        {prize.type === 'payout' && prize.amount != null && (
          <p className="mt-1 text-sm text-muted-foreground">
            Pays {formatMoney(prize.amount)}
          </p>
        )}
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <Field
          label="Winner"
          htmlFor="award-winner"
          hint={
            prize.winnerMemberId
              ? `Currently awarded to ${prize.winnerName ?? 'a member'}. Pick again to re-award.`
              : 'Who won this prize?'
          }
        >
          <Select
            id="award-winner"
            value={winnerId}
            disabled={pending}
            onChange={(e) => setWinnerId(e.target.value)}
          >
            <option value="">Select a member…</option>
            {members.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.displayName}
              </option>
            ))}
          </Select>
        </Field>

        {canPayout && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4">
            <input
              type="checkbox"
              checked={createObligation}
              disabled={pending}
              onChange={(e) => setCreateObligation(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-current"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign className="h-4 w-4 shrink-0" />
                Create financial obligation for this amount
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Adds a {formatMoney(prize.amount as number)} obligation against
                the winner in Finances, so it can be tracked like any other
                money owed. No money moves automatically.
              </span>
            </span>
          </label>
        )}
      </div>

      {error && <FormMessage>{error}</FormMessage>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <SubmitButton type="submit" loading={pending}>
          {prize.winnerMemberId ? 'Re-award prize' : 'Award prize'}
        </SubmitButton>
        <SubmitButton
          type="button"
          variant="outline"
          loading={pending}
          onClick={() => router.push(`/leagues/${leagueId}/finances/prizes`)}
        >
          Cancel
        </SubmitButton>
      </div>
    </form>
  )
}
