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

export type RuleCategoryRow = {
  id: string
  league_id: string
  name: string
  display_order: number
  created_at: string
}

export type RuleRow = {
  id: string
  league_id: string
  category_id: string | null
  title: string
  body: string
  is_published: boolean
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type RuleVersionRow = {
  id: string
  rule_id: string
  body: string
  changed_by: string
  changed_at: string
}

export type IntegrationConnectionRow = {
  id: string
  league_id: string
  provider: string
  external_league_id: string
  last_synced_at: string | null
  created_by: string
  created_at: string
  status: string
}

export type IntegrationSyncLogRow = {
  id: string
  connection_id: string
  synced_at: string
  status: string
  error_message: string | null
  raw_snapshot?: unknown
}

export type FinancialCategoryRow = {
  id: string
  league_id: string
  name: string
  type: string // 'dues' | 'side_bet' | 'penalty' | 'payout' | 'other'
  created_at: string
}

export type FinancialObligationRow = {
  id: string
  league_id: string
  member_id: string
  category_id: string | null
  /** numeric(12,2) — PostgREST may serialise this as number or string. */
  amount: number | string
  description: string
  due_date: string | null
  payment_instructions: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type FinancialPaymentRow = {
  id: string
  obligation_id: string
  /** numeric(12,2) — see FinancialObligationRow note. */
  amount: number | string
  recorded_by: string
  recorded_at: string
  notes: string | null
  status: string // 'pending' | 'received' | 'disputed'
}

export type PrizeStructureRow = {
  id: string
  league_id: string
  season_year: number
  place: number
  description: string
  /** numeric(12,2) — see FinancialObligationRow note. */
  amount: number | string
  created_by: string
  created_at: string
}

export type ActivityEventRow = {
  id: string
  league_id: string
  /** Null for system-generated events (see src/db/schema/activity.ts). */
  actor_id: string | null
  event_type: string
  description: string
  /** Free-form JSON bag emitted by recordActivity(); shape varies per type. */
  metadata?: Record<string, unknown> | null
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
