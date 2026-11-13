/**
 * Server-only read helpers for `integration_connections` (Sleeper-2 UI).
 *
 * Two responsibilities:
 *  1. Query the connection rows over PostgREST (raw snake_case columns per
 *     src/lib/db.ts) and map to camelCase view types at the boundary.
 *  2. Enrich a Sleeper connection with live league details (name, sport,
 *     season, member count), because the connection table stores only the
 *     external ID — the schema is already deployed and this task must not
 *     change it. Every Sleeper failure degrades to a `reason` string that
 *     pages can show; none of these helpers ever throw at render time.
 */
import { db } from '@/src/lib/db'
import type { IntegrationConnectionRow } from '@/src/db/rows'
import {
  SleeperAdapter,
  SleeperApiError,
  SleeperNotFoundError,
  SleeperRateLimitError,
  SleeperNetworkError,
} from './sleeper/adapter'

export type IntegrationConnectionView = {
  id: string
  provider: string
  externalLeagueId: string
  /** 'active' | 'disconnected' (schema default is 'active'). */
  status: string
  lastSyncedAt: Date | null
  createdAt: Date
}

export type SleeperSnapshot = {
  name: string
  /** Sleeper league status, e.g. 'playoffs' — free-text, display only. */
  leagueStatus: string
  sport: string
  season: string
  /** null when the users endpoint failed but the league itself loaded. */
  memberCount: number | null
}

export type SleeperSnapshotResult =
  | { ok: true; snapshot: SleeperSnapshot }
  | { ok: false; reason: string }

function toView(row: IntegrationConnectionRow): IntegrationConnectionView {
  return {
    id: row.id,
    provider: row.provider,
    externalLeagueId: row.external_league_id,
    status: row.status,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
    createdAt: new Date(row.created_at),
  }
}

const CONNECTION_COLUMNS =
  'id, league_id, provider, external_league_id, status, last_synced_at, created_by, created_at'

/** All connections for a league, any status, oldest first (hub page list). */
export async function listLeagueConnections(
  leagueId: string,
): Promise<IntegrationConnectionView[]> {
  const { data, error } = await db
    .from('integration_connections')
    .select(CONNECTION_COLUMNS)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('listLeagueConnections error:', error)
    return []
  }
  return ((data ?? []) as unknown as IntegrationConnectionRow[]).map(toView)
}

/**
 * The league's connection for one provider, regardless of status, or null.
 * The unique index on (league_id, provider) guarantees at most one row.
 */
export async function getProviderConnection(
  leagueId: string,
  provider: string,
): Promise<IntegrationConnectionView | null> {
  const { data, error } = await db
    .from('integration_connections')
    .select(CONNECTION_COLUMNS)
    .eq('league_id', leagueId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) {
    console.error('getProviderConnection error:', error)
    return null
  }
  return data ? toView(data as unknown as IntegrationConnectionRow) : null
}

/** A connection row by id, or null. Used by server actions for authz lookups. */
export async function getConnectionById(
  connectionId: string,
): Promise<IntegrationConnectionView | null> {
  const { data, error } = await db
    .from('integration_connections')
    .select(CONNECTION_COLUMNS)
    .eq('id', connectionId)
    .maybeSingle()

  if (error) {
    console.error('getConnectionById error:', error)
    return null
  }
  return data ? toView(data as unknown as IntegrationConnectionRow) : null
}

/**
 * Turn a Sleeper adapter failure into the one user-facing sentence the UI
 * should show. Shared by the snapshot fetch and the server actions so the
 * wording is identical everywhere; never leaks stack or URL detail.
 */
export function describeSleeperError(err: unknown): string {
  if (err instanceof SleeperNotFoundError) {
    return 'League not found on Sleeper. Check that the league ID is correct.'
  }
  if (err instanceof SleeperRateLimitError) {
    return 'Sleeper is rate-limiting requests right now. Try again in a minute.'
  }
  if (err instanceof SleeperNetworkError) {
    return 'Could not reach the Sleeper API. Check the connection and try again.'
  }
  if (err instanceof SleeperApiError) {
    return `Sleeper API error (${err.statusCode}). Try again shortly.`
  }
  return 'Could not load the league details from Sleeper.'
}

/**
 * Live league details for display. Never throws: callers get either a
 * snapshot or a short reason string to render. A failure on the members
 * endpoint still yields a snapshot with `memberCount: null` — one degraded
 * field beats losing the whole card.
 */
export async function fetchSleeperSnapshot(
  externalLeagueId: string,
): Promise<SleeperSnapshotResult> {
  const adapter = new SleeperAdapter()
  try {
    const league = await adapter.getLeague(externalLeagueId)
    let memberCount: number | null = null
    try {
      const members = await adapter.getMembers(externalLeagueId)
      memberCount = members.length
    } catch {
      memberCount = null
    }
    return {
      ok: true,
      snapshot: {
        name: league.name,
        leagueStatus: league.status,
        sport: league.sport,
        season: league.season,
        memberCount,
      },
    }
  } catch (err) {
    return { ok: false, reason: describeSleeperError(err) }
  }
}
