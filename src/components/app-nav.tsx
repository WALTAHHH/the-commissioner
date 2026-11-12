'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import SignOutButton from './SignOutButton'

/** /leagues/<id>... — the dynamic segment the Members/Settings links need. */
const LEAGUE_PATH = /^\/leagues\/([^/?#]+)/

type NavItem = {
  label: string
  /** null = no target yet (user is in no league), rendered inert. */
  href: string | null
  active: boolean
}

/**
 * Global top navigation for the signed-in app (Phase 1 / T5).
 *
 * Rendered by AppShell above /dashboard and /leagues/*. Links are
 * Dashboard / Members / Settings; the last two are league-scoped, so the
 * league id comes from the URL when we are inside a league and from
 * `fallbackLeagueId` (the viewer's most recent league) otherwise.
 *
 * Client component only because the active/current state needs the pathname —
 * all data still comes from the server.
 */
export default function AppNav({
  fallbackLeagueId = null,
}: {
  fallbackLeagueId?: string | null
}) {
  const pathname = usePathname()

  const leagueId = useMemo(() => {
    const match = pathname.match(LEAGUE_PATH)
    const segment = match?.[1]
    // /leagues/new is a creation form, not a league — it has no members page.
    if (segment && segment !== 'new') return segment
    return fallbackLeagueId
  }, [pathname, fallbackLeagueId])

  const inLeague = (suffix: string) =>
    leagueId !== null && pathname.startsWith(`/leagues/${leagueId}/${suffix}`)

  const items: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      active: pathname === '/dashboard' || pathname.startsWith('/dashboard/'),
    },
    {
      label: 'Members',
      href: leagueId ? `/leagues/${leagueId}/members` : null,
      active: inLeague('members'),
    },
    {
      label: 'Settings',
      href: leagueId ? `/leagues/${leagueId}/settings` : null,
      active: inLeague('settings'),
    },
  ]

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <Link
          href="/dashboard"
          className="text-base font-semibold tracking-tight text-black dark:text-zinc-50"
        >
          The Commissioner
        </Link>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {items.map((item) =>
            item.href === null ? (
              <span
                key={item.label}
                aria-disabled="true"
                title="You need to be in a league first"
                className="cursor-default text-sm text-zinc-400 dark:text-zinc-600"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={
                  item.active
                    ? 'text-sm font-medium text-black underline underline-offset-4 dark:text-zinc-50'
                    : 'text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50'
                }
              >
                {item.label}
              </Link>
            ),
          )}

          <SignOutButton variant="nav" />
        </div>
      </nav>
    </header>
  )
}
