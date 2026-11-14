'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Users,
  BookOpen,
  Settings,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Plug,
  Activity,
  Wallet,
  Scale,
  History,
} from 'lucide-react'
import SignOutButton from './SignOutButton'
import { cn } from 'cn'

const LEAGUE_PATH = /^\/leagues\/([^/?#]+)/

type NavItem = {
  label: string
  href: string | null
  icon: React.ReactNode
  active: boolean
}

type AppNavProps = {
  fallbackLeagueId?: string | null
  userEmail: string
}

export default function AppNav({ fallbackLeagueId = null, userEmail }: AppNavProps) {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [leagueId, setLeagueId] = useState<string | null>(null)

  useEffect(() => {
    const match = pathname.match(LEAGUE_PATH)
    const segment = match?.[1]
    if (segment && segment !== 'new') {
      setLeagueId(segment)
    } else {
      setLeagueId(fallbackLeagueId)
    }
  }, [pathname, fallbackLeagueId])

  const inLeague = (suffix: string) =>
    leagueId !== null && pathname.startsWith(`/leagues/${leagueId}/${suffix}`)

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: <Home className="h-5 w-5" />,
      active: pathname === '/dashboard' || pathname.startsWith('/dashboard/'),
    },
    {
      label: 'Members',
      href: leagueId ? `/leagues/${leagueId}/members` : null,
      icon: <Users className="h-5 w-5" />,
      active: inLeague('members'),
    },
    {
      label: 'Rules',
      href: leagueId ? `/leagues/${leagueId}/rules` : null,
      icon: <BookOpen className="h-5 w-5" />,
      active: inLeague('rules'),
    },
    {
      label: 'Activity',
      href: leagueId ? `/leagues/${leagueId}/activity` : null,
      icon: <Activity className="h-5 w-5" />,
      active: inLeague('activity'),
    },
    {
      label: 'Integrations',
      href: leagueId ? `/leagues/${leagueId}/integrations` : null,
      icon: <Plug className="h-5 w-5" />,
      active: inLeague('integrations'),
    },
    {
      label: 'Finances',
      href: leagueId ? `/leagues/${leagueId}/finances` : null,
      icon: <Wallet className="h-5 w-5" />,
      active: inLeague('finances'),
    },
    {
      label: 'Governance',
      href: leagueId ? `/leagues/${leagueId}/governance` : null,
      icon: <Scale className="h-5 w-5" />,
      active: inLeague('governance'),
    },
    {
      label: 'History',
      href: leagueId ? `/leagues/${leagueId}/history` : null,
      icon: <History className="h-5 w-5" />,
      active: inLeague('history'),
    },
    {
      label: 'Settings',
      href: leagueId ? `/leagues/${leagueId}/settings` : null,
      icon: <Settings className="h-5 w-5" />,
      active: inLeague('settings'),
    },
  ]

  // League switcher placeholder
  const leagueName = leagueId ? `League ${leagueId.slice(0, 4)}…` : 'Select League'

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
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((item) => (
          <NavLink key={item.label} item={item} />
        ))}
      </nav>

      {/* League switcher */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 text-secondary-foreground">
          <span className="text-sm font-medium truncate">{leagueName}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </div>
      </div>

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
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 text-secondary-foreground">
            <span className="text-sm font-medium truncate">{leagueName}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </div>
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
