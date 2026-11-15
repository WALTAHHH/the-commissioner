import { CircleDollarSign, ScrollText, Trophy } from 'lucide-react'
import { formatDate, formatMoney, pluralizeCount } from '@/src/lib/display'
import type { MemberAwardKind, MemberAwardView } from '@/src/lib/member-awards'

/**
 * Member profile → Awards & honours.
 *
 * A self-contained server component: it takes the already-loaded award list and
 * renders its own empty / populated states. Championships, runner-up finishes,
 * named league awards and prize wins share one list, distinguished by kind icon
 * and label; a prize payout shows its dollar amount only when `showAmounts` is
 * true (the loader applies the league's financial-visibility gate, so a hidden
 * amount is already null here).
 *
 * Read-only by design — recording results and awarding prizes live in the
 * history and finances/prizes surfaces.
 */
const AWARD_META: Record<
  MemberAwardKind,
  { icon: React.ReactNode; label: string; className: string }
> = {
  champion: { icon: <Trophy className="h-5 w-5" />, label: 'Champion', className: 'text-primary' },
  runner_up: {
    icon: <Trophy className="h-5 w-5" />,
    label: 'Runner-up',
    className: 'text-muted-foreground',
  },
  award: { icon: <ScrollText className="h-5 w-5" />, label: 'Award', className: 'text-warning' },
  prize: {
    icon: <CircleDollarSign className="h-5 w-5" />,
    label: 'Prize',
    className: 'text-success',
  },
}

export default function MemberAwardsSection({
  awards,
  showAmounts,
}: {
  /** Awards, newest season first (see loadMemberAwardsSection). */
  awards: MemberAwardView[]
  /** Whether prize amounts are visible to this viewer (financial-visibility gate). */
  showAmounts: boolean
}) {
  // Only worth a caption when the gate actually hid a figure.
  const hiddenPayout = !showAmounts && awards.some((a) => a.kind === 'prize')

  return (
    <section id="awards" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className="text-muted-foreground" aria-hidden="true">
            <Trophy className="h-5 w-5" />
          </span>
          Awards &amp; honours
        </h2>
        <span className="text-xs text-muted-foreground">
          {pluralizeCount(awards.length, 'award')}
        </span>
      </div>

      {awards.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          <span className="text-muted-foreground/70" aria-hidden="true">
            <Trophy className="h-5 w-5" />
          </span>
          No championships, awards or prize wins yet.
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {awards.map((a) => {
              const meta = AWARD_META[a.kind]
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4"
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted ${meta.className}`}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">{a.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {meta.label} · {a.seasonYear} season
                      {a.amount !== null ? ` · ${formatMoney(a.amount)}` : ''}
                      {' · '}
                      <time dateTime={a.occurredAt} title={formatDate(new Date(a.occurredAt))}>
                        {formatDate(new Date(a.occurredAt))}
                      </time>
                    </p>
                    {a.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {hiddenPayout ? (
            <p className="text-xs text-muted-foreground">
              Prize amounts are hidden — this league doesn&apos;t share member finances.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
