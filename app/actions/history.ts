'use server'

/**
 * League history — champions, awards, season recaps.
 *
 * Each season can have:
 *   - A season record (champion + runner-up, optional notes)
 *   - Multiple awards (MVP, best record, etc.)
 *   - A season recap (markdown text)
 *
 * Commissioner-only creation/editing; all members can view.
 *
 * Auth convention mirrors governance/finances: authenticate → validate →
 * authorize() → query. `authorize` is still the repo-wide deny-by-default
 * Phase-1 stub, so until the permission model lands these actions return
 * their authorization error for every caller — see PR notes.
 *
 * `createSeasonRecord` upserts on (league_id, season_year): the hub's
 * per-season Edit link needs an entry point for corrections, and the
 * done-criteria action list contains no separate update action, so the
 * create call is idempotent per season. `created_by`/`created_at` stay
 * pinned to the original author on the update path.
 */

import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { authorize } from '@/src/lib/auth/authorize'
import { recordActivity } from '@/src/lib/activity'
import { loadHistorySeasons, type LeagueSeasonView } from '@/src/lib/history'
import type {
  SeasonRecordRow,
  LeagueAwardRow,
  SeasonRecapRow,
  LeagueMemberRow,
} from '@/src/db/rows'

// ---------------------------------------------------------------------------
// Shared helpers (same shape as finances.ts)
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(str: string): boolean {
  return UUID_REGEX.test(str)
}

const SEASON_YEAR_MIN = 2000
const SEASON_YEAR_MAX = 2100

const MAX_TEAM_NAME = 200
const MAX_NOTES = 1000
const MAX_AWARD_NAME = 200
const MAX_AWARD_DESCRIPTION = 1000
const MAX_RECAP_BODY = 10000

function isValidSeasonYear(year: unknown): year is number {
  return (
    typeof year === 'number' &&
    Number.isInteger(year) &&
    year >= SEASON_YEAR_MIN &&
    year <= SEASON_YEAR_MAX
  )
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Verify a member belongs to THIS league. Returns missing ids. */
async function filterLeagueMembers(
  leagueId: string,
  memberIds: string[],
): Promise<string[]> {
  const { data, error } = await db
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .in('id', memberIds)
  if (error) return memberIds // treat query failure as "none found"
  const found = new Set(
    (data as unknown as Pick<LeagueMemberRow, 'id'>[]).map((r) => r.id),
  )
  return memberIds.filter((id) => !found.has(id))
}

// ---------------------------------------------------------------------------
// Result interfaces
// ---------------------------------------------------------------------------

export interface CreateSeasonRecordResult {
  recordId?: string
  /** 'created' when the season record is new, 'updated' when it replaced
   *  the existing row for that (league, season). */
  status?: 'created' | 'updated'
  error?: string
}

export interface CreateAwardResult {
  awardId?: string
  error?: string
}

export interface UpsertSeasonRecapResult {
  recapId?: string
  error?: string
}

export type LeagueHistorySeason = LeagueSeasonView

export interface GetLeagueHistoryResult {
  seasons?: LeagueHistorySeason[]
  error?: string
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create — or correct — the season record (champion, runner-up, notes).
 * Upserts on (league_id, season_year).
 * At least one of championMemberId or championTeamName must be provided.
 */
export async function createSeasonRecord(
  leagueId: string,
  {
    seasonYear,
    championMemberId,
    championTeamName,
    runnerUpMemberId,
    notes,
  }: {
    seasonYear: number
    championMemberId?: string
    championTeamName?: string
    runnerUpMemberId?: string
    notes?: string
  },
): Promise<CreateSeasonRecordResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!isValidSeasonYear(seasonYear)) {
    return { error: `Season year must be between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.` }
  }
  const teamName = championTeamName?.trim() || null
  const trimmedNotes = notes?.trim() || null
  if (!championMemberId && !teamName) {
    return { error: 'Provide either a champion member or a champion team name.' }
  }
  if (championMemberId && !isUuid(championMemberId)) {
    return { error: 'Invalid champion member ID.' }
  }
  if (runnerUpMemberId && !isUuid(runnerUpMemberId)) {
    return { error: 'Invalid runner‑up member ID.' }
  }
  if (teamName && teamName.length > MAX_TEAM_NAME) {
    return { error: `Champion team name must be at most ${MAX_TEAM_NAME} characters.` }
  }
  if (trimmedNotes && trimmedNotes.length > MAX_NOTES) {
    return { error: `Notes must be at most ${MAX_NOTES} characters.` }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'createSeasonRecord',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to create season records in this league.' }
  }

  // Validate member ids belong to this league.
  const memberIds = [championMemberId, runnerUpMemberId].filter(Boolean) as string[]
  if (memberIds.length > 0) {
    const missing = await filterLeagueMembers(leagueId, memberIds)
    if (missing.length > 0) {
      return { error: 'One or more selected members do not belong to this league.' }
    }
  }

  const values = {
    season_year: seasonYear,
    champion_member_id: championMemberId ?? null,
    champion_team_name: teamName,
    runner_up_member_id: runnerUpMemberId ?? null,
    notes: trimmedNotes,
  }

  // Idempotent per season: update the existing row (keeping created_by /
  // created_at pinned to the original author) instead of tripping the
  // season_records_league_year_idx unique index.
  const { data: existing, error: lookupError } = await db
    .from('season_records')
    .select('id')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .maybeSingle()

  if (lookupError) {
    console.error('createSeasonRecord lookup error:', lookupError)
    return { error: 'Failed to save season record.' }
  }

  if (existing) {
    const recordId = (existing as unknown as { id: string }).id
    const { error: updateError } = await db
      .from('season_records')
      .update(values)
      .eq('id', recordId)
    if (updateError) {
      console.error('createSeasonRecord update error:', updateError)
      return { error: 'Failed to save season record.' }
    }
    await recordActivity(
      leagueId,
      user.id,
      'season_record_updated',
      `Season ${seasonYear} record updated`,
      { recordId, seasonYear },
    )
    return { recordId, status: 'updated' }
  }

  const { data, error } = await db
    .from('season_records')
    .insert({
      league_id: leagueId,
      ...values,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    // Unique index race: two commissioners submitted the same season at once.
    if ((error as { code?: string } | null)?.code === '23505') {
      return { error: 'A season record for that year was just created. Refresh and edit it.' }
    }
    console.error('createSeasonRecord insert error:', error)
    return { error: 'Failed to create season record.' }
  }

  const recordId = (data as unknown as { id: string }).id
  await recordActivity(
    leagueId,
    user.id,
    'season_record_created',
    `Season ${seasonYear} record created`,
    { recordId, seasonYear },
  )

  return { recordId, status: 'created' }
}

/**
 * Create an award for a season.
 * Member may be null (team award).
 */
export async function createAward(
  leagueId: string,
  {
    seasonYear,
    memberId,
    awardName,
    description,
  }: {
    seasonYear: number
    memberId?: string
    awardName: string
    description?: string
  },
): Promise<CreateAwardResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!isValidSeasonYear(seasonYear)) {
    return { error: `Season year must be between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.` }
  }
  const name = awardName?.trim() || ''
  if (!name) {
    return { error: 'Award name is required.' }
  }
  if (name.length > MAX_AWARD_NAME) {
    return { error: `Award name must be at most ${MAX_AWARD_NAME} characters.` }
  }
  if (memberId && !isUuid(memberId)) {
    return { error: 'Invalid member ID.' }
  }
  const desc = description?.trim() || null
  if (desc && desc.length > MAX_AWARD_DESCRIPTION) {
    return { error: `Description must be at most ${MAX_AWARD_DESCRIPTION} characters.` }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'createAward',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to create awards in this league.' }
  }

  if (memberId) {
    const missing = await filterLeagueMembers(leagueId, [memberId])
    if (missing.length > 0) {
      return { error: 'Selected member does not belong to this league.' }
    }
  }

  const { data, error } = await db
    .from('league_awards')
    .insert({
      league_id: leagueId,
      season_year: seasonYear,
      member_id: memberId ?? null,
      award_name: name,
      description: desc,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    // league_awards_league_year_name_idx: one row per (league, season, name).
    if ((error as { code?: string } | null)?.code === '23505') {
      return { error: `An award named "${name}" already exists for season ${seasonYear}.` }
    }
    console.error('createAward insert error:', error)
    return { error: 'Failed to create award.' }
  }

  const awardId = (data as unknown as { id: string }).id
  await recordActivity(
    leagueId,
    user.id,
    'award_created',
    `Award "${name}" created for season ${seasonYear}`,
    { awardId, seasonYear },
  )

  return { awardId }
}

/**
 * Create or update a season recap (markdown body).
 * Upserts on (league_id, season_year); `created_by`/`created_at` keep their
 * original values on the update path, `updated_at` moves to now.
 */
export async function upsertSeasonRecap(
  leagueId: string,
  seasonYear: number,
  { body }: { body: string },
): Promise<UpsertSeasonRecapResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }
  if (!isValidSeasonYear(seasonYear)) {
    return { error: `Season year must be between ${SEASON_YEAR_MIN} and ${SEASON_YEAR_MAX}.` }
  }
  const trimmed = body?.trim() || ''
  if (!trimmed) {
    return { error: 'Recap body is required.' }
  }
  if (trimmed.length > MAX_RECAP_BODY) {
    return { error: `Recap body must be at most ${MAX_RECAP_BODY.toLocaleString()} characters.` }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'upsertSeasonRecap',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to edit season recaps in this league.' }
  }

  const { data: existing, error: lookupError } = await db
    .from('season_recaps')
    .select('id')
    .eq('league_id', leagueId)
    .eq('season_year', seasonYear)
    .maybeSingle()

  if (lookupError) {
    console.error('upsertSeasonRecap lookup error:', lookupError)
    return { error: 'Failed to save season recap.' }
  }

  if (existing) {
    const recapId = (existing as unknown as { id: string }).id
    const { error: updateError } = await db
      .from('season_recaps')
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq('id', recapId)
    if (updateError) {
      console.error('upsertSeasonRecap update error:', updateError)
      return { error: 'Failed to save season recap.' }
    }
    await recordActivity(
      leagueId,
      user.id,
      'season_recap_upserted',
      `Season ${seasonYear} recap updated`,
      { recapId, seasonYear },
    )
    return { recapId }
  }

  const { data, error } = await db
    .from('season_recaps')
    .insert({
      league_id: leagueId,
      season_year: seasonYear,
      body: trimmed,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    if ((error as { code?: string } | null)?.code === '23505') {
      return { error: 'A recap for that season was just created. Refresh and edit it.' }
    }
    console.error('upsertSeasonRecap insert error:', error)
    return { error: 'Failed to save season recap.' }
  }

  const recapId = (data as unknown as { id: string }).id
  await recordActivity(
    leagueId,
    user.id,
    'season_recap_upserted',
    `Season ${seasonYear} recap saved`,
    { recapId, seasonYear },
  )

  return { recapId }
}

/**
 * Fetch all history for a league, grouped by season, most recent first.
 * Read path is authorize()-gated exactly like getPolls; pages render via
 * src/lib/history instead (the stub denies every action repo-wide).
 */
export async function getLeagueHistory(
  leagueId: string,
): Promise<GetLeagueHistoryResult> {
  const user = await requireUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }
  if (!isUuid(leagueId)) {
    return { error: 'Invalid league ID.' }
  }

  const isAuthorized = await authorize({
    userId: user.id,
    leagueId,
    action: 'viewHistory',
  })
  if (!isAuthorized) {
    return { error: 'You are not authorized to view history in this league.' }
  }

  const seasons = await loadHistorySeasons(leagueId)
  if (seasons === null) {
    return { error: 'Failed to fetch history.' }
  }

  return { seasons }
}

// Re-export row types so callers can import the contracts from the action
// module without touching the DB layer.
export type { SeasonRecordRow, LeagueAwardRow, SeasonRecapRow }
