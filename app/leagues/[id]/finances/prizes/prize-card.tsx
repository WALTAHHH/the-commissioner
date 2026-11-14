'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2, X, Trophy, Medal, Star, Award as AwardIcon } from 'lucide-react'
import { deletePrize } from '@/app/actions/finances'
import { formatMoney, formatDate } from '@/src/lib/display'
import type { PrizeView } from '@/src/lib/finances'

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

/** Leading glyph: gold/silver/bronze for top season payouts, else a trophy. */
function prizeIcon(prize: PrizeView) {
  const cls = 'h-4 w-4 shrink-0'
  if (prize.scope === 'season' && prize.type === 'payout' && prize.place != null) {
    if (prize.place === 1) return <Trophy className={`${cls} text-amber-500`} />
    if (prize.place === 2) return <Medal className={`${cls} text-slate-400`} />
    if (prize.place === 3) return <Medal className={`${cls} text-amber-700`} />
    return <AwardIcon className={cls} />
  }
  if (prize.type === 'recognition') return <Star className={`${cls} text-violet-500`} />
  return <Trophy className={cls} />
}

/**
 * A single defined prize. Shows what it is (place / week / description /
 * amount), who won it (name + date) or "TBD", and — for the commissioner — an
 * Award link and a two-step delete. Awarding happens on its own page (winner
 * select + optional payout obligation), so this is just a navigation card.
 */
export function PrizeCard({
  leagueId,
  prize,
  canEdit,
}: {
  leagueId: string
  prize: PrizeView
  canEdit: boolean
}) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Season label ("1st place") vs weekly label ("Week 4") vs recognition.
  const scopeTag =
    prize.scope === 'weekly'
      ? prize.weekNumber != null
        ? `Week ${prize.weekNumber}`
        : 'Weekly'
      : prize.place != null
        ? ordinalize(prize.place)
        : 'Season'

  function remove() {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    setError(null)
    startTransition(async () => {
      const result = await deletePrize(prize.id)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
          {prizeIcon(prize)}
        </span>
        <div className="min-w-0">
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
          <p className="mt-1.5 truncate text-sm font-medium text-foreground">
            {prize.description}
          </p>
          {prize.type === 'payout' && prize.amount != null && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pays {formatMoney(prize.amount)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-2">
        {prize.winnerName ? (
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">
              {prize.winnerName}
            </p>
            {prize.awardedAt && (
              <p className="text-xs text-muted-foreground">
                Awarded {formatDate(new Date(prize.awardedAt))}
              </p>
            )}
          </div>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            TBD
          </span>
        )}

        {canEdit && (
          <div className="flex items-center gap-2">
            <Link
              href={`/leagues/${leagueId}/finances/prizes/${prize.id}/award`}
              scroll={false}
              className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <AwardIcon className="mr-1.5 h-3.5 w-3.5" />
              {prize.winnerMemberId ? 'Re-award' : 'Award'}
            </Link>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Delete prize"
              className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                armed
                  ? 'bg-destructive text-destructive-foreground'
                  : 'border border-destructive/30 text-destructive hover:bg-destructive/10'
              }`}
            >
              {armed ? (
                <>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Confirm
                </>
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive sm:col-span-2">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * One grouped block (e.g. "Season payouts"). Renders a divider-separated card
 * list; shows a muted empty line only when a group is empty but its sibling
 * (or the other section) has content, so an all-empty page defers to the
 * page-level empty state instead of showing four "none" lines.
 */
export function PrizeGroup({
  title,
  prizes,
  leagueId,
  canEdit,
}: {
  title: string
  prizes: PrizeView[]
  leagueId: string
  canEdit: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5 sm:px-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      {prizes.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
          None yet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {prizes.map((p) => (
            <PrizeCard key={p.id} leagueId={leagueId} prize={p} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  )
}
