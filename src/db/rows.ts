/**
 * Runtime row shapes returned by PostgREST.
 *
 * These mirror the *database* (snake_case columns, as `src/db/schema/*` defines
 * them via `text('team_name')` etc.), not the Drizzle property names. Drizzle
 * hid that translation for us; with the Supabase JS client the wire shape is
 * the DB shape, so the mapping is explicit and lives here in one place.
 *
 * Source of truth for the columns is still `src/db/schema/` — this file only
 * types what queries come back over HTTPS, so it must be updated together with
 * any migration that renames or adds a column a query reads.
 *
 * Timestamps arrive as ISO-8601 strings (PostgREST serialises `timestamptz` to
 * JSON text), never `Date` objects — callers that need a Date construct one at
 * the boundary, as `src/lib/dashboard.ts` does.
 */

export type LeagueRow = {
  id: string
  name: string
  description: string | null
  slug: string
  sport: string
  format: string
  commissioner_id: string
  created_at: string
  updated_at: string
}

export type LeagueMemberRow = {
  id: string
  league_id: string
  user_id: string
  role: string
  team_name: string | null
  status: string
  joined_at: string
}

export type LeagueSeasonRow = {
  id: string
  league_id: string
  season_year: number
  is_current: boolean | null
  created_at: string
}

export type InvitationRow = {
  id: string
  league_id: string
  token: string
  created_by: string
  expires_at: string
  max_uses: number | null
  use_count: number | null
  revoked_at: string | null
  created_at: string
}

/** The subset of `auth.users` we can reach: GoTrue admin API, not PostgREST. */
export type UserIdentityRow = {
  id: string
  email: string | null
  fullName: string | null
  name: string | null
  nickname: string | null
}
