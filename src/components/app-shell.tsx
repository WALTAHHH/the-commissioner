import { redirect } from 'next/navigation'
import { createClient } from '@/src/utils/supabase/server'
import { getPrimaryLeagueId } from '@/src/lib/dashboard'
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

  // Lets the nav point Members/Settings at something on non-league pages.
  const fallbackLeagueId = await getPrimaryLeagueId(session.user.id)
  const userEmail = session.user.email ?? ''

  return (
    <div className="flex min-h-screen bg-background font-sans">
      <AppNav 
        fallbackLeagueId={fallbackLeagueId} 
        userEmail={userEmail}
      />
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
          The Commissioner · Phase 1
        </footer>
      </div>
    </div>
  )
}
