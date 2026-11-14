import Link from 'next/link'
import { cn } from 'cn'

/**
 * Sub-navigation shared by the governance pages. Server component — the
 * active tab is passed by each page (no pathname hook needed), matching
 * `finances-nav.tsx`.
 */
export default function GovernanceNav({
  leagueId,
  active,
}: {
  leagueId: string
  active: 'overview' | 'polls' | 'decisions' | 'disputes'
}) {
  const base = `/leagues/${leagueId}/governance`
  const tabs: { key: typeof active; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: base },
    { key: 'polls', label: 'Polls', href: `${base}/polls` },
    { key: 'decisions', label: 'Decisions', href: `${base}/decisions` },
    { key: 'disputes', label: 'Disputes', href: `${base}/disputes` },
  ]

  return (
    <nav
      aria-label="Governance sections"
      className="flex gap-1 rounded-xl border border-border bg-card p-1 text-sm"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          scroll={false}
          className={cn(
            'flex-1 rounded-lg px-2 py-2 text-center font-medium transition-colors sm:px-4',
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
