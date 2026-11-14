'use client'

import { useState, type ReactNode } from 'react'
import { cn } from 'cn'

/**
 * Tab switcher for the prizes page: "Season prizes" / "Weekly prizes".
 * Same segmented-control pattern as `add-member-tabs.tsx` (no Radix tabs in
 * the kit). The panes arrive pre-rendered from the server page; switching is
 * purely local — no refetch, and the commissioner gates are enforced on the
 * server regardless of what is shown here.
 */
type Tab = 'season' | 'weekly'

const TABS: { id: Tab; label: string }[] = [
  { id: 'season', label: 'Season prizes' },
  { id: 'weekly', label: 'Weekly prizes' },
]

export default function PrizeTabs({
  seasonPane,
  weeklyPane,
}: {
  seasonPane: ReactNode
  weeklyPane: ReactNode
}) {
  const [tab, setTab] = useState<Tab>('season')

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Prize scope"
        className="inline-flex rounded-lg border border-border bg-muted p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4" role="tabpanel">
        {tab === 'season' ? seasonPane : weeklyPane}
      </div>
    </div>
  )
}
