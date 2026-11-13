'use server'

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { slugify, randomSuffix } from '@/src/lib/slug'
import { recordActivity } from '@/src/lib/activity'
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

    return { leagueId: leagueId as string }
  }

  console.error('createLeague failed', lastError)
  return { error: 'Could not create the league. Please try again.' }
}