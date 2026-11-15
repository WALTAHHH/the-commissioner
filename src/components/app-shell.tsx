import { redirect } from 'next/navigation'
import { createClient } from '@/src/utils/supabase/server'
import { listUserLeagues } from '@/src/lib/dashboard'
import AppNav from './app-nav'

export const dynamic = 'force-dynamic'

/**
 * Chrome for the signed-in app: session gate + global nav + page container.
 *
 * Used by app/dashboard/layout.tsx and app/leagues/layout.tsx, so every
 * authenticated route gets the same protection and the same navigation.
 * Individual pages still re-check the session and their own league access —
 * the layout is the convenience layer, not the security boundary.
 */
export default async function AppShell({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    redirect('/login')
  }

  // Every league the viewer can open, newest first, using the same access rule
  // every league page gates on (active membership, or commissioner). The nav
  // needs the whole list — not just a fallback id — so its league switcher can
  // offer the others, and so its section links point at the league the viewer
  // last chose rather than always at the newest one.
  const leagues = await listUserLeagues(session.user.id)
  const navLeagues = leagues.map(({ id, name }) => ({ id, name }))
  const userEmail = session.user.email ?? ''

  return (
    <div className="flex min-h-screen bg-background font-sans">
      <AppNav leagues={navLeagues} userEmail={userEmail} />
      <div className="flex flex-1 flex-col min-w-0">
        <main className="w-full flex-1 px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
          The Commissioner
        </footer>
      </div>
    </div>
  )
}
