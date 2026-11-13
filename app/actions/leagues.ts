'use server'

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { slugify, randomSuffix } from '@/src/lib/slug'
import {
  DEFAULT_SPORT,
  DEFAULT_FORMAT,
  isValidSport,
  isValidFormat,
} from '@/src/lib/league-options'
import type { LeagueRow } from '@/src/db/rows'

export interface CreateLeagueResult {
  leagueId?: string
  error?: string
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
 * Undo a partial league creation. Children first, then the parent, so no FK
 * violation hides the real failure. Best-effort: each delete is logged and we
 * keep going — a leaked row is a data-cleanliness bug, not a correctness one,
 * and the caller already gets an error either way.
 */
async function rollbackLeague(leagueId: string, userId: string): Promise<void> {
  const cleanup = [
    db.from('league_seasons').delete().eq('league_id', leagueId),
    db
      .from('league_members')
      .delete()
      .eq('league_id', leagueId)
      .eq('user_id', userId),
    db.from('leagues').delete().eq('id', leagueId),
  ]

  for (const step of cleanup) {
    const { error } = await step
    if (error) {
      console.error('createLeague rollback failed', leagueId, error)
    }
  }
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
 */
export async function createLeague(
  formData: FormData
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
    const { data: leagueData, error: leagueError } = await db
      .from('leagues')
      .insert({
        name,
        slug,
        sport,
        format,
        commissioner_id: user.id,
      })
      .select('id')
      .single()

    if (leagueError || !leagueData) {
      lastError = leagueError
      // Retry only when it is the unique slug colliding, not some other failure.
      if (!isUniqueViolation(leagueError)) break
      continue
    }

    const league = leagueData as unknown as Pick<LeagueRow, 'id'>

    // 3b. The creator's commissioner membership.
    const { error: memberError } = await db
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: user.id,
        role: 'commissioner',
        status: 'active',
      })

    if (memberError) {
      lastError = memberError
      await rollbackLeague(league.id, user.id)
      if (!isUniqueViolation(memberError)) break
      continue
    }

    // 3c. The opening season row, flagged current for the dashboard resolver.
    const { error: seasonError } = await db
      .from('league_seasons')
      .insert({
        league_id: league.id,
        season_year: seasonYear,
        is_current: true,
      })

    if (seasonError) {
      lastError = seasonError
      await rollbackLeague(league.id, user.id)
      if (!isUniqueViolation(seasonError)) break
      continue
    }

    return { leagueId: league.id }
  }

  console.error('createLeague failed', lastError)
  return { error: 'Could not create the league. Please try again.' }
}
