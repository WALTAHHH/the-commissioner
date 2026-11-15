'use server'

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { slugify, randomSuffix } from '@/src/lib/slug'
import { recordActivity } from '@/src/lib/activity'
import { connectESPN } from '@/app/actions/integrations'
import { isUuid } from '@/src/lib/invitations'
import {
  DEFAULT_SPORT,
  DEFAULT_FORMAT,
  isValidSport,
  isValidFormat,
} from '@/src/lib/league-options'
import type { LeagueRow, LeagueSeasonRow } from '@/src/db/rows'

export interface CreateLeagueResult {
  leagueId?: string
  error?: string
  /**
   * Set only when the league WAS created but the optional ESPN connection
   * failed (invalid id, cookies rejected, already claimed elsewhere…). The
   * caller must not retry creation — the connection can be redone from the
   * league's integrations hub. Mirrors how the create form treats a failed
   * Sleeper connect after the league row is committed.
   */
  espnError?: string
}

/**
 * ESPN params carried from the create flow (e.g. `/leagues/new?...&espnLeagueId=…`
 * handed off by an ESPN import step). When `espnLeagueId` is present the league
 * is additionally connected to that ESPN league after it is created.
 */
export interface CreateLeagueESPNInput {
  espnLeagueId: string
  /** 4-digit ESPN season; blank/absent means "this year" (connectESPN defaults). */
  espnSeasonYear?: string
  /** `espn_s2` cookie value — private leagues only. */
  espnS2?: string
  /** `SWID` cookie value — private leagues only. */
  swid?: string
}

const MAX_SLUG_ATTEMPTS = 5

/** SQLSTATE for a unique-constraint violation, as PostgREST reports it. */
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  )
}



/**
 * Create a league from the /leagues/new form.
 *
 * formData fields:
 *  - name     (required, 1-80 chars)
 *  - sport    (optional, validated against SPORT_OPTIONS; default 'football')
 *  - format   (optional, validated against FORMAT_OPTIONS; default 'redraft')
 *
 * Inserts the league row with the current user as commissioner, auto-generates
 * a URL-safe slug from the name (with a random suffix on collision).
 * Returns the new league's id so the caller can redirect to /leagues/[id].
 *
 * When `espn` carries an `espnLeagueId`, the freshly created league is also
 * connected to that ESPN league via `connectESPN` (same verification, claim
 * checks and cookie rules as the integrations-hub connect form). A failed
 * connection does NOT fail the creation — the league is already committed and
 * usable; the reason comes back as `espnError`.
 */
export async function createLeague(
  formData: FormData,
  espn?: CreateLeagueESPNInput
): Promise<CreateLeagueResult> {
  // 1. Auth — a league must have a commissioner.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to create a league.' }
  }

  // 2. Validate input (FormData is an untrusted entry point).
  const rawName = formData.get('name')
  const name = typeof rawName === 'string' ? rawName.trim() : ''

  if (!name || name.length < 2 || name.length > 80) {
    return { error: 'League name must be between 2 and 80 characters.' }
  }

  const rawSport = formData.get('sport')
  const sport =
    typeof rawSport === 'string' && isValidSport(rawSport)
      ? rawSport
      : DEFAULT_SPORT

  const rawFormat = formData.get('format')
  const format =
    typeof rawFormat === 'string' && isValidFormat(rawFormat)
      ? rawFormat
      : DEFAULT_FORMAT

  // 3. Insert, retrying with a suffixed slug if we lose a slug race.
  //
  //    Three rows are needed for a usable league: the league itself, its
  //    creator's commissioner membership (T4) and the opening league_seasons
  //    row (season-seed follow-up). Under Drizzle these shared one `tx`;
  //    PostgREST exposes one statement per HTTPS request, so there is no
  //    transaction to wrap them in. The intent is preserved with explicit
  //    compensation (rollbackLeague) instead: a failure partway through leaves
  //    no half-created league behind. The window is narrow but real — if the
  //    container dies between insert 1 and insert 2, an ownerless league row
  //    survives until someone cleans it up. If that ever matters, the fix is a
  //    `create_league(...)` Postgres function called through `db.rpc()`, which
  //    restores atomicity over a single request.
  const baseSlug = slugify(name)
  const seasonYear = new Date().getUTCFullYear()
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`

    // 3a. The league row. `commissioner_id` is the DB column name; PostgREST
    //     does not translate the camelCase Drizzle property.
    // 3a. Call the atomic create_league RPC.
    const { data: leagueId, error: rpcError } = await db.rpc('create_league', {
      p_name: name,
      p_slug: slug,
      p_sport: sport,
      p_format: format,
      p_commissioner_id: user.id,
    })

    if (rpcError) {
      lastError = rpcError
      // Retry only when it is the unique slug colliding, not some other failure.
      if (!isUniqueViolation(rpcError)) break
      continue
    }

    // Audit trail. Best-effort by design (see src/lib/activity.ts): a failed
    // event write must never roll back or fail a created league.
    await recordActivity(leagueId as string, user.id, 'league_created',
      `League “${name}” created`,
      { slug, sport, format },
    )

    const createdLeagueId = leagueId as string

    // 4. Optional ESPN connection (create-flow handoff). Same policy as the
    //    Sleeper connect in the create form: the league row is already
    //    committed, so a failed ESPN connect never un-creates the league —
    //    it surfaces as espnError and can be retried from the integrations
    //    hub. connectESPN does its own auth + commissioner + validation.
    const espnLeagueId = espn?.espnLeagueId?.trim() ?? ''
    if (espnLeagueId) {
      const connection = await connectESPN(createdLeagueId, {
        espnLeagueId,
        seasonYear: espn?.espnSeasonYear?.trim() ?? '',
        espnS2: espn?.espnS2,
        swid: espn?.swid,
      })
      if (connection.error) {
        console.warn(
          'createLeague: league created but ESPN connect failed:',
          connection.error,
        )
        return { leagueId: createdLeagueId, espnError: connection.error }
      }
    }

    return { leagueId: createdLeagueId }
  }

  console.error('createLeague failed', lastError)
  return { error: 'Could not create the league. Please try again.' }
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

async function requireCommissioner(userId: string, leagueId: string): Promise<boolean> {
  const { data, error } = await db
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (error || !data) return false
  return (data as unknown as { commissioner_id: string }).commissioner_id === userId
}

export interface UpdateLeagueResult {
  error?: string
  /** Set on a successful write; the settings form renders it as inline confirmation. */
  saved?: boolean
}

/**
 * Rename a league and/or change its sport.
 *
 * Only the two identity fields the settings page exposes are writable here —
 * `slug` is deliberately left alone (it is the league's public URL and other
 * rows/links reference it), and `format`/commissioner hand-off are out of
 * scope for this form.
 *
 * Validation mirrors createLeague: name 2-80 chars after trimming, sport must
 * be one of SPORT_OPTIONS. Commissioner-only, enforced server-side.
 */
export async function updateLeague(
  leagueId: string,
  { name, sport }: { name?: string; sport?: string },
): Promise<UpdateLeagueResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  const isCommissioner = await requireCommissioner(user.id, leagueId)
  if (!isCommissioner) {
    return { error: 'Only the commissioner can update league settings.' }
  }

  const updates: Record<string, unknown> = {}

  if (name !== undefined) {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 80) {
      return { error: 'League name must be between 2 and 80 characters.' }
    }
    updates.name = trimmed
  }

  if (sport !== undefined) {
    if (!isValidSport(sport)) {
      return { error: 'Choose a valid sport.' }
    }
    updates.sport = sport
  }

  // Nothing to write — treat as a no-op success so the form can confirm.
  if (Object.keys(updates).length === 0) {
    return { saved: true }
  }

  updates.updated_at = new Date().toISOString()

  const { error } = await db.from('leagues').update(updates).eq('id', leagueId)

  if (error) {
    console.error('updateLeague failed:', error)
    return { error: 'Failed to update league settings.' }
  }

  await recordActivity(
    leagueId,
    user.id,
    'league_settings_changed',
    'League name/sport updated',
    updates,
  )

  // Keep server-rendered copies of the name (page header, nav, settings
  // summary) in step with the write the commissioner just made.
  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/leagues/${leagueId}`, 'layout')

  return { saved: true }
}

export interface UpdateLeagueFinancialsResult {
  error?: string
}

export async function updateLeagueFinancials(
  leagueId: string,
  {
    financialVisibility,
    paymentInstructions,
    currency,
  }: {
    financialVisibility?: string
    paymentInstructions?: string
    currency?: string
  }
): Promise<UpdateLeagueFinancialsResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  const isCommissioner = await requireCommissioner(user.id, leagueId)
  if (!isCommissioner) {
    return { error: 'Only the commissioner can update financial settings.' }
  }

  // Validate financialVisibility
  const allowedVisibilities = ['full_transparency', 'admin_only', 'members_see_own', 'role_based']
  if (financialVisibility !== undefined && !allowedVisibilities.includes(financialVisibility)) {
    return { error: 'Invalid financial visibility value.' }
  }

  // Validate paymentInstructions length
  if (paymentInstructions !== undefined && paymentInstructions.length > 1000) {
    return { error: 'Payment instructions must be at most 1000 characters.' }
  }

  // Validate currency length
  if (currency !== undefined && currency.length > 10) {
    return { error: 'Currency code must be at most 10 characters.' }
  }

  const updates: Record<string, any> = {}
  if (financialVisibility !== undefined) updates.financial_visibility = financialVisibility
  if (paymentInstructions !== undefined) updates.payment_instructions = paymentInstructions
  if (currency !== undefined) updates.currency = currency

  // If no updates, early success
  if (Object.keys(updates).length === 0) {
    return {}
  }

  const { error } = await db
    .from('leagues')
    .update(updates)
    .eq('id', leagueId)

  if (error) {
    console.error('updateLeagueFinancials failed:', error)
    return { error: 'Failed to update financial settings.' }
  }

  // Record activity
  await recordActivity(
    leagueId,
    user.id,
    'league_settings_changed',
    'Financial settings updated',
    updates,
  )

  return {}
}

// ----------------------------------------------------------------------------
// League identity + season settings
// ----------------------------------------------------------------------------

export interface UpdateLeagueResult {
  error?: string
  /** Set on a successful write; the settings form renders it as inline confirmation. */
  saved?: boolean
}

/**
 * Update the editable settings of a league: its identity fields (name, sport,
 * format) and the year of its current season.
 *
 * Only the fields a commissioner may change from the settings page are
 * writable here — `slug` is deliberately left alone (it is the league's public
 * URL and other rows/links reference it) and commissioner hand-off is out of
 * scope. Callers pass only the fields they own; any field left undefined is
 * untouched.
 *
 * Validation mirrors createLeague: name 2-80 chars after trimming, sport and
 * format must be members of SPORT_OPTIONS / FORMAT_OPTIONS, and the season year
 * must satisfy isValidSeasonYear. Commissioner-only, enforced server-side.
 *
 * @param leagueId  uuid of the league
 * @param fields    any subset of { name, sport, format, currentSeasonYear }
 */
export async function updateLeague(
  leagueId: string,
  {
    name,
    sport,
    format,
    currentSeasonYear,
  }: {
    name?: string
    sport?: string
    format?: string
    currentSeasonYear?: number
  },
): Promise<UpdateLeagueResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  const isCommissioner = await requireCommissioner(user.id, leagueId)
  if (!isCommissioner) {
    return { error: 'Only the commissioner can update league settings.' }
  }

  // ---- validate every supplied field before writing anything ----
  const updates: Record<string, unknown> = {}

  if (name !== undefined) {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 80) {
      return { error: 'League name must be between 2 and 80 characters.' }
    }
    updates.name = trimmed
  }

  if (sport !== undefined) {
    if (!isValidSport(sport)) {
      return { error: 'Choose a valid sport.' }
    }
    updates.sport = sport
  }

  if (format !== undefined) {
    if (!isValidFormat(format)) {
      return { error: 'Choose a valid format.' }
    }
    updates.format = format
  }

  if (currentSeasonYear !== undefined && !isValidSeasonYear(currentSeasonYear)) {
    return {
      error: `Season year must be an integer between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.`,
    }
  }

  const hasLeagueUpdates = Object.keys(updates).length > 0
  const hasSeasonUpdate = currentSeasonYear !== undefined

  // Nothing to write — treat as a no-op success so the form can confirm.
  if (!hasLeagueUpdates && !hasSeasonUpdate) {
    return { saved: true }
  }

  // ---- leagues table: name / sport / format ----
  if (hasLeagueUpdates) {
    updates.updated_at = new Date().toISOString()

    const { error } = await db
      .from('leagues')
      .update(updates)
      .eq('id', leagueId)

    if (error) {
      console.error('updateLeague failed:', error)
      return { error: 'Failed to update league settings.' }
    }
  }

  // ---- league_seasons: retarget the year of the current season ----
  if (hasSeasonUpdate) {
    const { data: currentSeason, error: seasonReadError } = await db
      .from('league_seasons')
      .select('id, season_year')
      .eq('league_id', leagueId)
      .eq('is_current', true)
      .maybeSingle()

    if (seasonReadError) {
      console.error('updateLeague season read failed:', seasonReadError)
      return { error: 'Failed to update the season year.' }
    }

    if (currentSeason) {
      // A different row must not already own the target year
      // ((league_id, season_year) is unique). Checking first turns the
      // constraint violation into a friendly message.
      const { data: clash, error: clashError } = await db
        .from('league_seasons')
        .select('id')
        .eq('league_id', leagueId)
        .eq('season_year', currentSeasonYear)
        .neq('id', (currentSeason as { id: string }).id)

      if (clashError) {
        console.error('updateLeague season clash check failed:', clashError)
        return { error: 'Failed to update the season year.' }
      }
      if (clash && clash.length > 0) {
        return { error: `Season ${currentSeasonYear} already exists for this league.` }
      }

      const { error: seasonUpdateError } = await db
        .from('league_seasons')
        .update({ season_year: currentSeasonYear })
        .eq('id', (currentSeason as { id: string }).id)
        .eq('league_id', leagueId) // belt-and-braces: never touch a foreign row

      if (seasonUpdateError) {
        console.error('updateLeague season update failed:', seasonUpdateError)
        return { error: 'Failed to update the season year.' }
      }
    } else {
      // Leagues created before season seeding may have no current row; create
      // one so the edited year becomes the league's current season.
      const { error: seasonInsertError } = await db
        .from('league_seasons')
        .insert({ league_id: leagueId, season_year: currentSeasonYear, is_current: true })

      if (seasonInsertError) {
        if (isUniqueViolation(seasonInsertError)) {
          return { error: `Season ${currentSeasonYear} already exists for this league.` }
        }
        console.error('updateLeague season insert failed:', seasonInsertError)
        return { error: 'Failed to update the season year.' }
      }
    }
  }

  // Audit trail — best-effort by design (see src/lib/activity.ts); a failed
  // event write must never fail an otherwise committed settings update.
  await recordActivity(
    leagueId,
    user.id,
    'league_settings_changed',
    hasSeasonUpdate
      ? `League settings updated (season year → ${currentSeasonYear})`
      : 'League settings updated',
    { ...updates, ...(hasSeasonUpdate ? { currentSeasonYear } : {}) },
  )

  // Keep the server-rendered copies of these values (page header, settings
  // cards) in step with the write the commissioner just made.
  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/leagues/${leagueId}`, 'layout')
  revalidatePath(`/leagues/${leagueId}/settings`)

  return { saved: true }
}

// ----------------------------------------------------------------------------
// Season rollover
// ----------------------------------------------------------------------------

/** Inclusive bounds for a season year (same convention as app/actions/history.ts). */
const SEASON_YEAR_MIN = 2000
const SEASON_YEAR_MAX = 2100

function isValidSeasonYear(year: unknown): year is number {
  return (
    typeof year === 'number' &&
    Number.isInteger(year) &&
    year >= SEASON_YEAR_MIN &&
    year <= SEASON_YEAR_MAX
  )
}

/** The camelCase view of one `league_seasons` row, mapped at the action boundary. */
export interface RolledOverSeason {
  id: string
  leagueId: string
  seasonYear: number
  isCurrent: boolean
  createdAt: string
}

export interface RolloverSeasonResult {
  season?: RolledOverSeason
  error?: string
}

function toRolledOverSeason(row: LeagueSeasonRow): RolledOverSeason {
  return {
    id: row.id,
    leagueId: row.league_id,
    seasonYear: row.season_year,
    isCurrent: row.is_current === true,
    createdAt: row.created_at,
  }
}

/**
 * Roll a league over into a new season: archive the current `league_seasons`
 * row (`is_current = false`) and insert the fresh one (`is_current = true`).
 *
 * Commissioner-only, via the shared requireUser/requireCommissioner guards
 * (leagues.commissioner_id is the source of truth — the authorize() stub still
 * denies everything, matching the announcements/finances convention).
 * Historical rows are never deleted or modified beyond the is_current flip,
 * so the season list doubles as the league's season archive; per-season stats
 * live in their own tables and are untouched by definition.
 *
 * Atomicity note: like createLeague, this cannot run as one PostgREST
 * transaction (one statement per HTTPS request), so ordering is chosen for
 * the least-bad crash window — archive first, then insert, and if the insert
 * fails we flip the archived row back before returning. A container death
 * between the two writes could leave the league with no current season; the
 * reads in dashboard/finances already tolerate that (they fall back to the
 * newest season_year). A future `rollover_season` RPC (same pattern as
 * create_league) would close the window entirely.
 *
 * @param leagueId  uuid of the league
 * @param newSeasonYear  integer season year for the fresh season row
 */
export async function rolloverSeason(
  leagueId: string,
  { newSeasonYear }: { newSeasonYear: number },
): Promise<RolloverSeasonResult> {
  // 1. Auth + input validation (both arrive through the client boundary).
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in to roll the season over.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!isValidSeasonYear(newSeasonYear)) {
    return {
      error: `Season year must be an integer between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.`,
    }
  }

  // 2. Authorization — commissioner of THIS league. requireCommissioner
  //    returns false for a missing league too: not your league, same answer.
  if (!(await requireCommissioner(user.id, leagueId))) {
    return { error: 'Only the league commissioner can roll the season over.' }
  }

  // 3. Read the league's season rows once — smallest table in the flow, and
  //    one request gives us both the current season and any collision on the
  //    target year (the (league_id, season_year) unique index would reject the
  //    insert anyway; checking first turns that into a friendly error).
  const { data: seasonData, error: seasonError } = await db
    .from('league_seasons')
    .select('id, league_id, season_year, is_current, created_at')
    .eq('league_id', leagueId)
  if (seasonError) {
    console.error('rolloverSeason season read error:', seasonError)
    return { error: 'Could not roll the season over. Please try again.' }
  }
  const seasons = (seasonData ?? []) as unknown as LeagueSeasonRow[]
  if (seasons.some((s) => s.season_year === newSeasonYear)) {
    return { error: `Season ${newSeasonYear} already exists for this league.` }
  }
  const current = seasons.find((s) => s.is_current === true) ?? null

  // 4. Archive the current season (when there is one).
  let archivedId: string | null = null
  if (current) {
    const { error: archiveError } = await db
      .from('league_seasons')
      .update({ is_current: false })
      .eq('id', current.id)
      .eq('league_id', leagueId) // belt-and-braces: never flip a foreign row
    if (archiveError) {
      console.error('rolloverSeason archive error:', archiveError)
      return { error: 'Could not roll the season over. Please try again.' }
    }
    archivedId = current.id
  }

  // 5. Insert the new season. On failure, undo step 4 so the league never
  //    loses its current season to a half-applied rollover.
  const { data: inserted, error: insertError } = await db
    .from('league_seasons')
    .insert({ league_id: leagueId, season_year: newSeasonYear, is_current: true })
    .select('id, league_id, season_year, is_current, created_at')
    .single()

  if (insertError) {
    if (archivedId) {
      const { error: undoError } = await db
        .from('league_seasons')
        .update({ is_current: true })
        .eq('id', archivedId)
        .eq('league_id', leagueId)
      if (undoError) {
        // Worst realistic window: no current season until a human/rollover fixes it.
        console.error('rolloverSeason rollback error:', undoError)
      }
    }
    if (isUniqueViolation(insertError)) {
      // Lost a race against an identical rollover — the season now exists.
      return { error: `Season ${newSeasonYear} already exists for this league.` }
    }
    console.error('rolloverSeason insert error:', insertError)
    return { error: 'Could not roll the season over. Please try again.' }
  }

  const season = toRolledOverSeason(inserted as unknown as LeagueSeasonRow)

  // 6. Audit trail — best-effort by design (see src/lib/activity.ts); a failed
  //    event write must never fail a committed rollover.
  await recordActivity(
    leagueId,
    user.id,
    'season_rolled_over',
    `Season rolled over to ${newSeasonYear}`,
    {
      newSeasonId: season.id,
      newSeasonYear,
      archivedSeasonId: archivedId,
      archivedSeasonYear: current?.season_year ?? null,
    },
  )

  return { season }
}