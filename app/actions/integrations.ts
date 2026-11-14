'use server'

/**
 * Server actions for integration connections (Sleeper-2, ESPN-2).
 *
 * Authorisation note: every action re-derives the viewer's role from the DB
 * via `loadLeagueContext` (leagues.commissioner_id is the source of truth,
 * same rule the pages use). It deliberately does NOT call the
 * `authorize()` stub in src/lib/auth/authorize.ts — that stub is a
 * deny-for-everything placeholder that would make the feature non-functional
 * until the permission model lands.
 *
 * Uniqueness constraints the DB enforces (see src/db/schema/integrations.ts):
 *  - (league_id, provider): one connection row per provider per league, even
 *    after disconnect. So "connect" on a disconnected row reactivates it.
 *  - (provider, external_league_id): one Sleeper league cannot be claimed by
 *    two of our leagues.
 *
 * Credential note (ESPN): `espn_s2` / `swid` are the commissioner's live
 * session cookies. They are written and read only inside these actions and
 * inside src/lib/integrations/espn/snapshot.ts, are masked in the form, never
 * returned to any view type or page, and never written to the activity feed.
 */
import { revalidatePath } from 'next/cache'
import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
import { recordActivity } from '@/src/lib/activity'
import {
  getConnectionById,
  describeSleeperError,
  type IntegrationConnectionView,
} from '@/src/lib/integrations/connections'
import {
  SleeperAdapter,
  SleeperNotFoundError,
} from '@/src/lib/integrations/sleeper/adapter'
import { syncSleeperLeague } from '@/src/lib/integrations/sleeper/sync'
import { ESPNNotFoundError, ESPNAuthRequiredError } from '@/src/lib/integrations/espn/adapter'
import { syncESPNLeague } from '@/src/lib/integrations/espn/sync'
import {
  ESPN_PROVIDER,
  MAX_SEASON_YEAR,
  MIN_SEASON_YEAR,
  describeESPNError,
  isESPNLeagueId,
  isValidSeasonYear,
  resolveCookies,
  verifyESPNLeague,
} from '@/src/lib/integrations/espn/snapshot'
import {
  mapSleeperFormat,
  mapSleeperSport,
  sleeperScoringDescriptor,
} from '@/src/lib/integrations/sleeper/mapping'
import type { IntegrationConnectionRow } from '@/src/db/rows'

const SLEEPER_PROVIDER = 'sleeper'

/**
 * Sleeper league IDs are large numeric strings (e.g. 289646328504385536,
 * live-verified in the adapter test). Anything else is a typo or a pasted
 * full URL, so we fail fast before burning an API round-trip.
 */
const SLEEPER_LEAGUE_ID_PATTERN = /^\d{4,32}$/

export interface ConnectSleeperResult {
  ok?: boolean
  connectionId?: string
  error?: string
}

export interface SimpleResult {
  ok?: boolean
  error?: string
}

export interface TriggerSyncResult extends SimpleResult {
  connection?: IntegrationConnectionView
}

/**
 * Onboarding import preview: the normalized slice of a Sleeper league used to
 * pre-fill the review step. Read-only — no DB writes, no connection row.
 * The connection itself is saved on Step 2 confirmation via `connectSleeper`.
 */
export interface PreviewSleeperResult {
  ok: boolean
  error?: string
  /** League name as shown on Sleeper. */
  name?: string
  /** Mapped to our SPORT_OPTIONS value ('football' …). */
  sport?: string
  /** Mapped to our FORMAT_OPTIONS value ('redraft' …). */
  format?: string
  /** Display label combining scoring + style, e.g. 'PPR Redraft'. */
  formatLabel?: string
  /** Sleeper season year, e.g. '2025'. */
  season?: string
  /** Number of roster spots / members on Sleeper. */
  teamCount?: number
  /** Members (users) on the Sleeper league. */
  memberCount?: number
  /** Sleeper league status, e.g. 'pre' | 'regular' | 'playoffs' | 'post'. */
  status?: string
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Commissioner gate shared by all three write actions. */
async function requireCommissioner(
  leagueId: string,
  userId: string,
): Promise<{ error: string } | { ctx: NonNullable<Awaited<ReturnType<typeof loadLeagueContext>>> }> {
  const ctx = await loadLeagueContext(leagueId, userId)
  if (!ctx) return { error: 'League not found.' }
  if (!ctx.isCommissioner) {
    return { error: 'Only the commissioner can manage integrations.' }
  }
  return { ctx }
}

function revalidateIntegrationPages(leagueId: string) {
  revalidatePath(`/leagues/${leagueId}/integrations`)
  revalidatePath(`/leagues/${leagueId}/integrations/sleeper`)
  revalidatePath(`/leagues/${leagueId}/integrations/espn`)
}

/**
 * Verify a Sleeper league exists, then save (or reactivate) the connection.
 *
 * Order matters for the UX: the Sleeper existence check runs before any DB
 * write, so an invalid/unknown ID never leaves a broken row behind.
 */
export async function connectSleeper(
  leagueId: string,
  sleeperLeagueId: string,
): Promise<ConnectSleeperResult> {
  const user = await requireUser()
  if (!user) return { error: 'You must be signed in.' }
  if (!isUuid(leagueId)) return { error: 'Invalid league ID.' }

  const externalId = sleeperLeagueId.trim()
  if (!SLEEPER_LEAGUE_ID_PATTERN.test(externalId)) {
    return {
      error:
        'Invalid Sleeper league ID — enter only the number that appears in your Sleeper league URL.',
    }
  }

  const gate = await requireCommissioner(leagueId, user.id)
  if ('error' in gate) return { error: gate.error }

  // 1. Verify the league exists on Sleeper (typed errors -> friendly copy).
  const adapter = new SleeperAdapter()
  try {
    await adapter.getLeague(externalId)
  } catch (err) {
    return { error: describeSleeperError(err) }
  }

  // 2. Is that Sleeper league already claimed by another of our leagues?
  //    (unique index provider+external_league_id; pre-check for the message).
  const { data: claimed, error: claimedError } = await db
    .from('integration_connections')
    .select('id, league_id')
    .eq('provider', SLEEPER_PROVIDER)
    .eq('external_league_id', externalId)
    .maybeSingle()

  if (claimedError) {
    console.error('connectSleeper claim lookup error:', claimedError)
    return { error: 'Could not check existing connections. Try again.' }
  }
  if (claimed && (claimed as { league_id: string }).league_id !== leagueId) {
    return {
      error: 'That Sleeper league is already connected to a different league.',
    }
  }

  // 3. Our league's existing Sleeper row (any status) decides insert vs reactivate.
  const { data: existing, error: existingError } = await db
    .from('integration_connections')
    .select('id, status, external_league_id')
    .eq('league_id', leagueId)
    .eq('provider', SLEEPER_PROVIDER)
    .maybeSingle()

  if (existingError) {
    console.error('connectSleeper existing lookup error:', existingError)
    return { error: 'Could not check the current connection. Try again.' }
  }

  if (existing) {
    const row = existing as { id: string; status: string; external_league_id: string }
    if (row.status === 'active') {
      if (row.external_league_id === externalId) {
        return { error: 'This league is already connected to that Sleeper league.' }
      }
      return {
        error:
          'This league is already connected to a different Sleeper league. Disconnect it first.',
      }
    }

    // Disconnected row: reactivate. A re-point to a different Sleeper league
    // invalidates the old sync, so last_synced_at resets only then.
    const updates: Record<string, unknown> = {
      status: 'active',
      created_by: user.id,
    }
    if (row.external_league_id !== externalId) {
      updates.external_league_id = externalId
      updates.last_synced_at = null
    }
    const { error: reactivateError } = await db
      .from('integration_connections')
      .update(updates)
      .eq('id', row.id)
    if (reactivateError) {
      console.error('connectSleeper reactivate error:', reactivateError)
      return { error: 'Failed to save the connection. Try again.' }
    }
    await recordActivity(
      leagueId,
      user.id,
      'integration_connected',
      `Sleeper league ${externalId} connected`,
      { connectionId: row.id, provider: SLEEPER_PROVIDER, externalLeagueId: externalId, reactivated: true },
    )
    revalidateIntegrationPages(leagueId)
    return { ok: true, connectionId: row.id }
  }

  // 4. Fresh insert. The 23505 catch covers the race against step 2/3.
  const { data: inserted, error: insertError } = await db
    .from('integration_connections')
    .insert({
      league_id: leagueId,
      provider: SLEEPER_PROVIDER,
      external_league_id: externalId,
      status: 'active',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return { error: 'That Sleeper league is already connected elsewhere.' }
    }
    console.error('connectSleeper insert error:', insertError)
    return { error: 'Failed to save the connection. Try again.' }
  }

  await recordActivity(
    leagueId,
    user.id,
    'integration_connected',
    `Sleeper league ${externalId} connected`,
    { connectionId: (inserted as { id: string }).id, provider: SLEEPER_PROVIDER, externalLeagueId: externalId },
  )
  revalidateIntegrationPages(leagueId)
  return { ok: true, connectionId: (inserted as { id: string }).id }
}

/**
 * Look up a Sleeper league for the onboarding preview (Step 1 → Step 2).
 *
 * Read-only: hits the Sleeper API, maps the result onto our select-option
 * values, and hands it back. Nothing is written to the DB here — the actual
 * `integration_connections` row lands in `connectSleeper` when the review
 * step is confirmed. Requires a signed-in user so this cannot be abused as
 * an anonymous proxy against the Sleeper API.
 */
export async function previewSleeperLeague(
  sleeperLeagueId: string,
): Promise<PreviewSleeperResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const externalId = String(sleeperLeagueId ?? '').trim()
  if (!SLEEPER_LEAGUE_ID_PATTERN.test(externalId)) {
    return {
      ok: false,
      error:
        'Invalid Sleeper league ID — enter only the number that appears in your Sleeper league URL.',
    }
  }

  const adapter = new SleeperAdapter()
  let league: Awaited<ReturnType<SleeperAdapter['getLeague']>>
  let members: Awaited<ReturnType<SleeperAdapter['getMembers']>>
  try {
    // The review step needs the league itself plus a head-count for the
    // "Imported from Sleeper" badge — fetch both in parallel.
    ;[league, members] = await Promise.all([
      adapter.getLeague(externalId),
      adapter.getMembers(externalId),
    ])
  } catch (err) {
    return { ok: false, error: describeSleeperError(err) }
  }

  const { value: format, label: styleLabel } = mapSleeperFormat(league.settings)
  const scoring = sleeperScoringDescriptor(league)

  return {
    ok: true,
    name: league.name,
    sport: mapSleeperSport(league.sport),
    format,
    formatLabel: `${scoring} ${styleLabel}`.trim(),
    season: league.season,
    teamCount: members.length,
    memberCount: members.length,
    status: league.status,
  }
}

/* ---------------------------------------------------------------------
 * ESPN (ESPN-2, t_1e9423de)
 * ------------------------------------------------------------------- */

export interface ConnectESPNInput {
  /** ESPN league id from the league URL (`.../ffl/league?leagueId=1241838`). */
  espnLeagueId: string
  /** Season the ESPN league belongs to; empty means "this year". */
  seasonYear: string | number
  /** `espn_s2` cookie value — private leagues only. */
  espnS2?: string
  /** `SWID` cookie value — private leagues only. */
  swid?: string
}

export interface ConnectESPNResult {
  ok?: boolean
  connectionId?: string
  error?: string
  /**
   * ESPN refused the league for want of usable cookies. The form uses this
   * to auto-reveal the espn_s2 / SWID fields instead of only showing text.
   */
  needsCookies?: boolean
}

export interface UpdateESPNCookiesResult {
  ok?: boolean
  error?: string
}

/**
 * Verify an ESPN league exists (public, or private with the supplied
 * cookies), then save — or reactivate — the connection row.
 *
 * Mirrors `connectSleeper` in shape and ordering, with two ESPN-specific
 * differences:
 *  - the season year is part of the identity of what we sync (ESPN's API is
 *    keyed by season), so it is stored on the row;
 *  - the two session cookies are stored here and nowhere else, and only after
 *    ESPN has accepted them, so a typo never lands as a "connected" league
 *    that 401s on every sync.
 *
 * The existence check still runs before any DB write: an invalid or
 * cookie-less private league leaves no broken row behind.
 */
export async function connectESPN(
  leagueId: string,
  input: ConnectESPNInput,
): Promise<ConnectESPNResult> {
  const user = await requireUser()
  if (!user) return { error: 'You must be signed in.' }
  if (!isUuid(leagueId)) return { error: 'Invalid league ID.' }

  const externalId = String(input?.espnLeagueId ?? '').trim()
  if (!isESPNLeagueId(externalId)) {
    return {
      error:
        'Invalid ESPN league ID — enter only the number from your ESPN league URL, like 1241838.',
    }
  }

  // Blank season means "current" (the form pre-fills it); anything else must
  // be a plausible year, checked before we spend a round-trip.
  const rawSeason = String(input?.seasonYear ?? '').trim()
  const seasonYear = rawSeason === '' ? new Date().getFullYear() : Number(rawSeason)
  if (!Number.isInteger(seasonYear) || !isValidSeasonYear(seasonYear)) {
    return {
      error: `Invalid season year — enter a 4-digit year between ${MIN_SEASON_YEAR} and ${MAX_SEASON_YEAR}.`,
    }
  }

  const gate = await requireCommissioner(leagueId, user.id)
  if ('error' in gate) return { error: gate.error }

  // Both cookies or neither — a lone espn_s2 still 401s at ESPN.
  const cookies = resolveCookies({ espnS2: input?.espnS2, swid: input?.swid })
  if (cookies.error) return { error: cookies.error }

  // 1. Verify against ESPN (typed errors -> friendly copy + a reveal hint).
  const verified = await verifyESPNLeague(externalId, seasonYear, cookies.cookies)
  if (!verified.ok) {
    return { error: verified.error, needsCookies: verified.needsCookies }
  }

  // 2. Is that ESPN league already claimed by another of our leagues?
  //    (unique index provider+external_league_id; pre-check for the message.)
  const { data: claimed, error: claimedError } = await db
    .from('integration_connections')
    .select('id, league_id')
    .eq('provider', ESPN_PROVIDER)
    .eq('external_league_id', externalId)
    .maybeSingle()

  if (claimedError) {
    console.error('connectESPN claim lookup error:', claimedError.message)
    return { error: 'Could not check existing connections. Try again.' }
  }
  if (claimed && (claimed as { league_id: string }).league_id !== leagueId) {
    return {
      error: 'That ESPN league is already connected to a different league.',
    }
  }

  // 3. Our league's existing ESPN row (any status) decides insert vs reactivate.
  const { data: existing, error: existingError } = await db
    .from('integration_connections')
    .select('id, status, external_league_id')
    .eq('league_id', leagueId)
    .eq('provider', ESPN_PROVIDER)
    .maybeSingle()

  if (existingError) {
    console.error('connectESPN existing lookup error:', existingError.message)
    return { error: 'Could not check the current connection. Try again.' }
  }

  // Written once here so both paths store exactly the same cookie columns.
  const cookieColumns = {
    espn_s2: cookies.cookies?.espnS2 ?? null,
    swid: cookies.cookies?.swid ?? null,
  }

  if (existing) {
    const row = existing as { id: string; status: string; external_league_id: string }
    if (row.status === 'active') {
      if (row.external_league_id === externalId) {
        // Same league, same credentials path: nothing to do, but tell the
        // user which case they are in so the form does not look broken.
        return { error: 'This league is already connected to that ESPN league.' }
      }
      return {
        error:
          'This league is already connected to a different ESPN league. Disconnect it first.',
      }
    }

    // Disconnected (or auth_required) row: reactivate with the freshly
    // verified ids, season and cookies.
    const { error: reactivateError } = await db
      .from('integration_connections')
      .update({
        status: 'active',
        created_by: user.id,
        external_league_id: externalId,
        season_year: verified.league.seasonYear,
        ...cookieColumns,
        last_synced_at: row.external_league_id === externalId ? undefined : null,
      })
      .eq('id', row.id)
    if (reactivateError) {
      console.error('connectESPN reactivate error:', reactivateError.message)
      return { error: 'Failed to save the connection. Try again.' }
    }
    await recordActivity(
      leagueId,
      user.id,
      'integration_connected',
      `${espnLeagueLabel(verified.league.name, externalId, cookies.cookies != null)} connected`,
      {
        connectionId: row.id,
        provider: ESPN_PROVIDER,
        externalLeagueId: externalId,
        seasonYear: verified.league.seasonYear,
        private: cookies.cookies != null,
        reactivated: true,
      },
    )
    revalidateIntegrationPages(leagueId)
    return { ok: true, connectionId: row.id }
  }

  // 4. Fresh insert. The 23505 catch covers the race against step 2/3.
  const { data: inserted, error: insertError } = await db
    .from('integration_connections')
    .insert({
      league_id: leagueId,
      provider: ESPN_PROVIDER,
      external_league_id: externalId,
      season_year: verified.league.seasonYear,
      status: 'active',
      created_by: user.id,
      ...cookieColumns,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return { error: 'That ESPN league is already connected elsewhere.' }
    }
    // Log the code only — an insert error can echo column values, and two of
    // ours are session cookies.
    console.error('connectESPN insert error:', insertError.code, insertError.message)
    return { error: 'Failed to save the connection. Try again.' }
  }

  await recordActivity(
    leagueId,
    user.id,
    'integration_connected',
    `${espnLeagueLabel(verified.league.name, externalId, cookies.cookies != null)} connected`,
    {
      connectionId: (inserted as { id: string }).id,
      provider: ESPN_PROVIDER,
      externalLeagueId: externalId,
      seasonYear: verified.league.seasonYear,
      private: cookies.cookies != null,
    },
  )
  revalidateIntegrationPages(leagueId)
  return { ok: true, connectionId: (inserted as { id: string }).id }
}

/**
 * Replace the stored session cookies for a private ESPN connection.
 *
 * Cookies are only ever written after ESPN accepts them, so a stale paste
 * cannot leave the connection in a state that fails every later sync. On
 * success the status is cleared back to 'active', which is what removes the
 * "cookies may have expired" banner.
 *
 * Takes a connectionId (not a leagueId) because the caller is already on the
 * connection's page; the league is resolved from the row so authorisation
 * still keys off `leagues.commissioner_id`.
 */
export async function updateESPNCookies(
  connectionId: string,
  cookies: { espnS2: string; swid: string },
): Promise<UpdateESPNCookiesResult> {
  const user = await requireUser()
  if (!user) return { error: 'You must be signed in.' }
  if (!isUuid(connectionId)) return { error: 'Invalid connection.' }

  const connection = await getConnectionById(connectionId)
  if (!connection) return { error: 'Connection not found.' }
  if (connection.provider !== ESPN_PROVIDER) {
    return { error: 'This connection is not an ESPN league.' }
  }

  const leagueId = await leagueIdForConnection(connectionId)
  if (!leagueId) return { error: 'Connection not found.' }

  const gate = await requireCommissioner(leagueId, user.id)
  if ('error' in gate) return { error: gate.error }

  const resolved = resolveCookies(cookies)
  if (!resolved.cookies) {
    return { error: resolved.error ?? 'Enter both the espn_s2 and SWID cookie values.' }
  }

  // Re-read the row for the season (the view drops everything but the id, and
  // we need the season to build a valid ESPN URL).
  const { data: row, error: rowError } = await db
    .from('integration_connections')
    .select('id, external_league_id, season_year')
    .eq('id', connectionId)
    .maybeSingle()
  if (rowError || !row) {
    console.error('updateESPNCookies lookup error:', rowError?.message)
    return { error: 'Could not load the connection. Try again.' }
  }
  const externalId = (row as { external_league_id: string }).external_league_id
  const storedSeason = (row as { season_year?: number | null }).season_year

  const verified = await verifyESPNLeague(
    externalId,
    storedSeason ?? new Date().getFullYear(),
    resolved.cookies,
  )
  if (!verified.ok) {
    return {
      error: verified.error,
      // ESPN says the league itself is unreachable with these cookies.
      ...(verified.needsCookies ? { needsCookies: true } : {}),
    }
  }

  const { error: updateError } = await db
    .from('integration_connections')
    .update({
      espn_s2: resolved.cookies.espnS2,
      swid: resolved.cookies.swid,
      season_year: verified.league.seasonYear,
      status: 'active',
    })
    .eq('id', connectionId)

  if (updateError) {
    console.error('updateESPNCookies update error:', updateError.code)
    return { error: 'Failed to save the cookies. Try again.' }
  }

  // Deliberately vague in the audit trail: never log a cookie value.
  await recordActivity(
    leagueId,
    user.id,
    'integration_cookies_updated',
    `ESPN session cookies updated for league ${externalId}`,
    { connectionId, provider: ESPN_PROVIDER, externalLeagueId: externalId },
  )
  revalidateIntegrationPages(leagueId)
  return { ok: true }
}

/** Activity-feed copy: marks private leagues without naming any credential. */
function espnLeagueLabel(name: string, externalId: string, isPrivate: boolean): string {
  const base = name || `ESPN league ${externalId}`
  return isPrivate ? `${base} (private)` : base
}

/**
 * Soft-disconnect: status -> 'disconnected'. The row stays (unique index
 * means it would be recreated on reconnect anyway) and the sync log keeps
 * its history. Idempotent by design.
 */
export async function disconnectIntegration(
  connectionId: string,
): Promise<SimpleResult> {
  const user = await requireUser()
  if (!user) return { error: 'You must be signed in.' }
  if (!isUuid(connectionId)) return { error: 'Invalid connection.' }

  const connection = await getConnectionById(connectionId)
  if (!connection) return { error: 'Connection not found.' }

  const leagueId = await leagueIdForConnection(connectionId)
  if (!leagueId) return { error: 'Connection not found.' }

  const gate = await requireCommissioner(leagueId, user.id)
  if ('error' in gate) return { error: gate.error }

  if (connection.status !== 'disconnected') {
    const { error } = await db
      .from('integration_connections')
      .update({ status: 'disconnected' })
      .eq('id', connectionId)
    if (error) {
      console.error('disconnectIntegration error:', error)
      return { error: 'Failed to disconnect. Try again.' }
    }
  }

  revalidateIntegrationPages(gate.ctx.id)
  return { ok: true }
}

/**
 * Pull fresh league/member/roster data through syncSleeperLeague (which
 * writes its own integration_sync_log row and bumps last_synced_at) and
 * return the updated connection so the caller can repaint "last synced".
 */
export async function triggerSync(connectionId: string): Promise<TriggerSyncResult> {
  const user = await requireUser()
  if (!user) return { error: 'You must be signed in.' }
  if (!isUuid(connectionId)) return { error: 'Invalid connection.' }

  const connection = await getConnectionById(connectionId)
  if (!connection) return { error: 'Connection not found.' }
  // Provider gate: we have sync implementations for Sleeper and ESPN;
  // anything else falls through as a user-facing "not supported yet".
  const isSleeper = connection.provider === SLEEPER_PROVIDER
  const isESPN = connection.provider === ESPN_PROVIDER
  if (!isSleeper && !isESPN) {
    return { error: 'This provider does not support sync yet.' }
  }
  if (connection.status !== 'active') {
    return { error: 'Reconnect before syncing.' }
  }

  const leagueId = await leagueIdForConnection(connectionId)
  if (!leagueId) return { error: 'Connection not found.' }

  const gate = await requireCommissioner(leagueId, user.id)
  if ('error' in gate) return { error: gate.error }

  try {
    if (isSleeper) {
      await syncSleeperLeague(connectionId)
    } else {
      await syncESPNLeague(connectionId)
    }
  } catch (err) {
    if (isSleeper) {
      // syncSleeperLeague rethrows the original adapter error after logging it;
      // SleeperNotFoundError is the common "league deleted/made private" case.
      if (err instanceof SleeperNotFoundError) {
        return {
          error: 'This league no longer exists on Sleeper, or it has been made private.',
        }
      }
      return { error: describeSleeperError(err) }
    }
    // ESPN path: map the adapter's typed errors to user copy.
    if (err instanceof ESPNAuthRequiredError) {
      // syncESPNLeague already flipped the row to status='auth_required';
      // the page banner reflects that after revalidation, so all the user
      // needs is the one-line explanation right now.
      return { error: 'ESPN rejected your cookies (they may have expired). Update them to resume syncing.' }
    }
    if (err instanceof ESPNNotFoundError) {
      return {
        error: 'This league no longer exists on ESPN, or the season year is wrong.',
      }
    }
    return { error: describeESPNError(err, connection.hasCookies) }
  }

  const updated = await getConnectionById(connectionId)
  await recordActivity(
    leagueId,
    user.id,
    'integration_synced',
    isSleeper ? 'Synced roster data from Sleeper' : 'Synced roster data from ESPN',
    { connectionId, provider: isSleeper ? SLEEPER_PROVIDER : ESPN_PROVIDER },
  )
  revalidateIntegrationPages(leagueId)
  return { ok: true, connection: updated ?? connection }
}

/**
 * Raw league_id for a connection row. Needed because the camelCase view
 * drops it, but every authorisation decision keys off it.
 */
async function leagueIdForConnection(
  connectionId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('integration_connections')
    .select('league_id')
    .eq('id', connectionId)
    .maybeSingle()
  if (error || !data) return null
  return (data as unknown as Pick<IntegrationConnectionRow, 'league_id'>).league_id
}
