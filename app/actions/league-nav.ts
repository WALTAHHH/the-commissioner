'use server'

import { createClient } from '@/src/utils/supabase/server'
import { loadLeagueContext } from '@/src/lib/dashboard'

/**
 * Returns the display name for the league the nav is currently viewing,
 * or null when the league id is missing or the viewer cannot see the league.
 */
export async function getLeagueName(leagueId: string): Promise<string | null> {
  if (!leagueId) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const ctx = await loadLeagueContext(leagueId, user.id)
  return ctx?.name ?? null
}
