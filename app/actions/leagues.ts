'use server'

import { db } from '@/src/lib/db'
import { leagues } from '@/src/db/schema/leagues'
import { createClient } from '@/src/utils/supabase/server'
import { slugify, randomSuffix } from '@/src/lib/slug'
import {
  DEFAULT_SPORT,
  DEFAULT_FORMAT,
  isValidSport,
  isValidFormat,
} from '@/src/lib/league-options'

export interface CreateLeagueResult {
  leagueId?: string
  error?: string
}

const MAX_SLUG_ATTEMPTS = 5

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
  const baseSlug = slugify(name)
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug =
      attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`

    try {
      const [inserted] = await db
        .insert(leagues)
        .values({
          name,
          slug,
          sport,
          format,
          commissionerId: user.id,
        })
        .returning({ id: leagues.id })

      return { leagueId: inserted.id }
    } catch (err) {
      lastError = err
      // 23505 = unique_violation — retry only when it's the slug colliding.
      const isSlugConflict =
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'

      if (!isSlugConflict) break
    }
  }

  console.error('createLeague failed', lastError)
  return { error: 'Could not create the league. Please try again.' }
}
