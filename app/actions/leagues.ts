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
import type { LeagueRow } from '@/src/db/rows'

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