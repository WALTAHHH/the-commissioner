'use server'

/**
 * Server actions for integration connections (Sleeper-2).
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
 */
import { revalidatePath } from 'next/cache'
import { db } from '@/src/lib/db'
import { createClient } from '@/src/utils/supabase/server'
import { loadLeagueContext } from '@/src/lib/dashboard'
import { isUuid } from '@/src/lib/invitations'
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
  if (connection.provider !== SLEEPER_PROVIDER) {
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
    await syncSleeperLeague(connectionId)
  } catch (err) {
    // syncSleeperLeague rethrows the original adapter error after logging it;
    // SleeperNotFoundError is the common "league deleted/made private" case.
    if (err instanceof SleeperNotFoundError) {
      return {
        error: 'This league no longer exists on Sleeper, or it has been made private.',
      }
    }
    return { error: describeSleeperError(err) }
  }

  const updated = await getConnectionById(connectionId)
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
