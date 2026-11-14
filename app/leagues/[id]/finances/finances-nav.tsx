import Link from 'next/link'
import { cn } from 'cn'

/**
 * Sub-navigation shared by the three finances pages: overview (obligations),
 * ledger, prizes. Server component — the active tab is passed by each page
 * (no pathname hook needed).
 */
export default function FinancesNav({
  leagueId,
  active,
}: {
  leagueId: string
  active: 'overview' | 'ledger' | 'prizes'
}) {
  const base = `/leagues/${leagueId}/finances`
  const tabs: { key: typeof active; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: base },
    { key: 'ledger', label: 'Ledger', href: `${base}/ledger` },
    { key: 'prizes', label: 'Prizes', href: `${base}/prizes` },
  ]

  return (
    <nav
      aria-label="Finances sections"
      className="flex gap-1 rounded-xl border border-border bg-card p-1 text-sm"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          scroll={false}
          className={cn(
            'flex-1 rounded-lg px-3 py-2 text-center font-medium transition-colors sm:flex-none sm:px-4',
            tab.key === active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
