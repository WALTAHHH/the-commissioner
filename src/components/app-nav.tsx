'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  Users,
  BookOpen,
  Settings,
  Menu,
  X,
  ChevronDown,
  Check,
  Plug,
  Activity,
  Wallet,
  Scale,
  History,
  Megaphone,
  Search,
} from 'lucide-react'
import SignOutButton from './SignOutButton'
import { cn } from 'cn'

/** `/leagues/<id>/<rest>` — group 2 keeps the section (and any deeper path). */
const LEAGUE_PATH = /^\/leagues\/([^/?#]+)(.*)$/

/**
 * Keys the user's last-chosen league in localStorage so the choice survives
 * navigations and reloads. Read at runtime, never at module scope: the nav is
 * server-rendered first, and a module-level read would break that.
 */
export const PREFERRED_LEAGUE_STORAGE_KEY = 'the-commissioner:preferred-league-id'

/** Placeholder label for a viewer who is in no league at all. */
const NO_LEAGUE_LABEL = 'Select League'

type NavItem = {
  label: string
  href: string | null
  icon: React.ReactNode
  active: boolean
}

/** One league as the switcher needs it — the server component supplies these. */
export type NavLeague = {
  id: string
  name: string
}

export type LeagueSwitcherState = {
  /** The league the nav treats as current (URL first, then the preference, then the primary league). */
  activeLeagueId: string | null
  /** Display name of that league, or null when it is not in the viewer's list. */
  activeLeagueName: string | null
  /** True only when there is more than one league to switch between. */
  canSwitch: boolean
}

/**
 * Everything the sidebar switcher renders from, as one pure function.
 *
 *  - `activeLeagueId` is the league in the URL, else the viewer's stored
 *    preference (when it is still one of their leagues), else their primary
 *    (newest) league — the same league every section link points at from a
 *    non-league page such as /dashboard. `/leagues/new` is a creation form,
 *    not a league, so it falls through to the preference.
 *  - `activeLeagueName` is looked up in the server-supplied list, never a
 *    truncated id, so the switcher names the league rather than a uuid.
 *  - `canSwitch` is true only with two or more leagues, so a single-league
 *    user gets a plain label with no dropdown affordance.
 */
export function resolveLeagueSwitcher(
  pathname: string,
  leagues: NavLeague[],
  preferredLeagueId: string | null = null,
): LeagueSwitcherState {
  const pathLeagueId = pathname.match(LEAGUE_PATH)?.[1]
  const urlLeagueId = pathLeagueId && pathLeagueId !== 'new' ? pathLeagueId : null
  const knownIds = new Set(leagues.map((league) => league.id))

  const activeLeagueId =
    urlLeagueId ??
    (preferredLeagueId && knownIds.has(preferredLeagueId) ? preferredLeagueId : null) ??
    leagues[0]?.id ??
    null

  return {
    activeLeagueId,
    activeLeagueName: leagues.find((league) => league.id === activeLeagueId)?.name ?? null,
    canSwitch: leagues.length > 1,
  }
}

/**
 * The `href` a section link should point at for `leagueId`, and the `href` that
 * keeps the viewer in the same section when they switch leagues.
 *
 * `sectionPath` is the path below `/leagues/<id>` (possibly empty, or several
 * segments deep such as `/finances/ledger`).
 */
export function leagueSectionHref(
  leagueId: string | null,
  sectionPath: string,
): string | null {
  if (!leagueId) return null
  const suffix = sectionPath.startsWith('/') ? sectionPath : `/${sectionPath}`
  return sectionPath ? `/leagues/${leagueId}${suffix}` : `/leagues/${leagueId}`
}

type AppNavProps = {
  /** The viewer's leagues, newest first — see resolveLeagueSwitcher. */
  leagues: NavLeague[]
  userEmail: string
}

export default function AppNav({ leagues, userEmail }: AppNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [preferredLeagueId, setPreferredLeagueId] = useState<string | null>(null)

  // localStorage is client-only, so the preference is adopted after mount.
  // Until then the switcher falls back to the primary league — the same league
  // the nav pointed at before preferences existed — so there is nothing to
  // flash and no hydration mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PREFERRED_LEAGUE_STORAGE_KEY)
      if (stored) setPreferredLeagueId(stored)
    } catch {
      // Private mode / storage disabled: the in-memory preference still works.
    }
  }, [])

  const leagueMatch = pathname.match(LEAGUE_PATH)
  const pathLeagueId = leagueMatch?.[1] === 'new' ? null : (leagueMatch?.[1] ?? null)
  const sectionPath = pathLeagueId ? (leagueMatch?.[2] ?? '') : ''

  // Following a link into another league (an invite, a notification email) is
  // also a choice of league: remember it, so returning to /dashboard lands on
  // the league the viewer was last actually in.
  useEffect(() => {
    if (!pathLeagueId || pathLeagueId === preferredLeagueId) return
    if (!leagues.some((league) => league.id === pathLeagueId)) return
    setPreferredLeagueId(pathLeagueId)
    try {
      window.localStorage.setItem(PREFERRED_LEAGUE_STORAGE_KEY, pathLeagueId)
    } catch {
      // See above — the in-memory value is enough for this session.
    }
  }, [pathLeagueId, preferredLeagueId, leagues])

  const { activeLeagueId: leagueId, activeLeagueName, canSwitch } =
    resolveLeagueSwitcher(pathname, leagues, preferredLeagueId)

  /** Switch context: remember the choice, then keep the current section if there is one. */
  const selectLeague = (nextLeagueId: string) => {
    setPreferredLeagueId(nextLeagueId)
    try {
      window.localStorage.setItem(PREFERRED_LEAGUE_STORAGE_KEY, nextLeagueId)
    } catch {
      // Non-fatal: the selection still applies for this session.
    }
    setIsMobileMenuOpen(false)

    if (pathLeagueId && nextLeagueId !== pathLeagueId) {
      router.push(leagueSectionHref(nextLeagueId, sectionPath) as string)
    }
  }

  // Active section for any route under it: /finances, /finances/ledger,
  // /governance/polls/new all light up their top-level entry. The trailing
  // '/' guard keeps a sibling route that merely shares a prefix (e.g. a
  // hypothetical /activity-log) from highlighting the wrong entry.
  const inLeague = (suffix: string) => {
    if (!leagueId) return false
    const base = `/leagues/${leagueId}/${suffix}`
    return pathname === base || pathname.startsWith(`${base}/`)
  }

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: <Home className="h-5 w-5" />,
      active: pathname === '/dashboard' || pathname.startsWith('/dashboard/'),
    },
    {
      label: 'Search',
      href: leagueSectionHref(leagueId, 'search'),
      icon: <Search className="h-5 w-5" />,
      active: inLeague('search'),
    },
    {
      label: 'Announcements',
      href: leagueSectionHref(leagueId, 'announcements'),
      icon: <Megaphone className="h-5 w-5" />,
      active: inLeague('announcements'),
    },
    {
      label: 'Rules',
      href: leagueSectionHref(leagueId, 'rules'),
      icon: <BookOpen className="h-5 w-5" />,
      active: inLeague('rules'),
    },
    {
      label: 'Finances',
      href: leagueSectionHref(leagueId, 'finances'),
      icon: <Wallet className="h-5 w-5" />,
      active: inLeague('finances'),
    },
    {
      label: 'Activity',
      href: leagueSectionHref(leagueId, 'activity'),
      icon: <Activity className="h-5 w-5" />,
      active: inLeague('activity'),
    },
    {
      label: 'Governance',
      href: leagueSectionHref(leagueId, 'governance'),
      icon: <Scale className="h-5 w-5" />,
      active: inLeague('governance'),
    },
    {
      label: 'History',
      href: leagueSectionHref(leagueId, 'history'),
      icon: <History className="h-5 w-5" />,
      active: inLeague('history'),
    },
    {
      label: 'Integrations',
      href: leagueSectionHref(leagueId, 'integrations'),
      icon: <Plug className="h-5 w-5" />,
      active: inLeague('integrations'),
    },
    {
      label: 'Members',
      href: leagueSectionHref(leagueId, 'members'),
      icon: <Users className="h-5 w-5" />,
      active: inLeague('members'),
    },
    {
      label: 'Settings',
      href: leagueSectionHref(leagueId, 'settings'),
      icon: <Settings className="h-5 w-5" />,
      active: inLeague('settings'),
    },
  ]

  const switcher = (
    <LeagueSwitcher
      leagues={leagues}
      activeLeagueId={leagueId}
      activeLeagueName={activeLeagueName}
      canSwitch={canSwitch}
      onSelect={selectLeague}
    />
  )

  // Desktop sidebar
  const desktopSidebar = (
    <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card h-screen sticky top-0">
      {/* Logo / Wordmark */}
      <div className="px-6 py-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">
            The Commissioner
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.label} item={item} />
        ))}
      </nav>

      {/* League switcher */}
      <div className="px-4 py-4 border-t border-border">{switcher}</div>

      {/* User email + Sign out */}
      <div className="px-4 py-4 border-t border-border mt-auto">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="truncate text-sm text-muted-foreground">{userEmail}</div>
          <SignOutButton variant="icon" />
        </div>
      </div>
    </aside>
  )

  // Mobile header (top bar)
  const mobileHeader = (
    <header className="md:hidden sticky top-0 z-50 border-b border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 rounded-md hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6 text-foreground" />
        </button>
        <Link href="/dashboard" className="font-serif text-xl font-bold tracking-tight text-foreground">
          The Commissioner
        </Link>
        <div className="w-10"> {/* spacer for balance */}
        </div>
      </div>
    </header>
  )

  // Mobile drawer
  const mobileDrawer = (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden',
        isMobileMenuOpen ? 'block' : 'hidden'
      )}
      onClick={() => setIsMobileMenuOpen(false)}
    >
      <div
        className="absolute left-0 top-0 h-full w-72 border-r border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">
            The Commissioner
          </span>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 rounded-md hover:bg-accent"
            aria-label="Close menu"
          >
            <X className="h-6 w-6 text-foreground" />
          </button>
        </div>
        <nav className="px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <NavLink key={item.label} item={item} />
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border">{switcher}</div>
        <div className="px-4 py-4 border-t border-border mt-auto">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="truncate text-sm text-muted-foreground">{userEmail}</div>
            <SignOutButton variant="icon" />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {desktopSidebar}
      {mobileHeader}
      {mobileDrawer}
    </>
  )
}

/**
 * Current league, and — for a viewer in more than one league — the dropdown
 * that switches between them. A single-league viewer gets the name only: there
 * is nothing to switch to, so no affordance is offered.
 */
function LeagueSwitcher({
  leagues,
  activeLeagueId,
  activeLeagueName,
  canSwitch,
  onSelect,
}: {
  leagues: NavLeague[]
  activeLeagueId: string | null
  activeLeagueName: string | null
  canSwitch: boolean
  onSelect: (leagueId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // Close on outside click / Escape. `mousedown` (not `click`) so the menu is
  // already gone before the element underneath reacts to the click.
  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const label = activeLeagueName ?? NO_LEAGUE_LABEL

  if (!canSwitch) {
    return (
      <div className="flex items-center px-3 py-2 rounded-lg bg-secondary/50 text-secondary-foreground">
        <span className="text-sm font-medium truncate" title={label}>
          {label}
        </span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`Current league: ${label}. Switch league`}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-secondary-foreground hover:bg-accent transition-colors"
      >
        <span className="min-w-0 text-left">
          <span className="block text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
            League
          </span>
          <span className="block text-sm font-medium truncate" title={label}>
            {label}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="menu"
          aria-label="Switch league"
          className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {leagues.map((league) => {
            const isActive = league.id === activeLeagueId
            return (
              <button
                key={league.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setIsOpen(false)
                  onSelect(league.id)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                <span className="truncate" title={league.name}>
                  {league.name}
                </span>
                {isActive && <Check aria-hidden className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Helper component for navigation links
function NavLink({ item }: { item: NavItem }) {
  if (item.href === null) {
    return (
      <span
        aria-disabled="true"
        title="You need to be in a league first"
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground opacity-60 cursor-not-allowed"
      >
        {item.icon}
        {item.label}
      </span>
    )
  }
  return (
    <Link
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
        item.active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-foreground hover:bg-accent/50'
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  )
}