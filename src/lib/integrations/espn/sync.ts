import { db } from '../../db'
import { ESPNAdapter, ESPNAuthRequiredError } from './adapter'
import { resolveCookies } from './snapshot'

/**
 * Sync an ESPN league connection.
 *
 * Flow (ESPN-1b spec):
 *  1. Load the connection row from `integration_connections` (including espn_s2/swid if present).
 *  2. Instantiate `ESPNAdapter` with cookies if available.
 *  3. Fetch league + members + rosters + current week matchups.
 *  4. Store raw snapshot in `integration_sync_log.raw_snapshot`.
 *  5. Update `last_synced_at`.
 *  6. If `ESPNAuthRequiredError` → update connection status to 'auth_required', surfaces error.
 *
 * Uses the Supabase JS client only (`db` from src/lib/db.ts, service-role).
 *
 * Season handling: the ESPN FFL endpoint is keyed by season
 * (`/seasons/{year}/segments/0/leagues/{id}`), so a sync needs a year. It comes
 * from `integration_connections.season_year` (written by ESPN-2's connectESPN);
 * rows predating that column fall back to the current calendar year and the
 * real value ESPN reports is backfilled onto the row on the first successful
 * sync, so a later season rollover still self-corrects.
 *
 * @returns the id of the `integration_sync_log` row that was written.
 */
export async function syncESPNLeague(connectionId: string): Promise<string> {
  // 1. Load the connection.
  const { data: connection, error: connError } = await db
    .from('integration_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();

  if (connError) {
    throw new Error(`Failed to load connection ${connectionId}: ${connError.message}`);
  }
  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }
  if (connection.provider !== 'espn') {
    throw new Error(
      `Connection ${connectionId} has provider '${String(connection.provider)}', expected 'espn'`,
    );
  }

  // ESPN league IDs are numeric in the API path; a non-numeric value can only
  // come from a row written outside connectESPN, so fail before the round-trip.
  const leagueIdNumber = Number(String(connection.external_league_id).trim());
  if (!Number.isInteger(leagueIdNumber) || leagueIdNumber <= 0) {
    throw new Error(
      `Connection ${connectionId} has a non-numeric ESPN league ID: '${String(connection.external_league_id)}'`,
    );
  }

  const seasonYear: number =
    typeof connection.season_year === 'number' && connection.season_year > 0
      ? connection.season_year
      : new Date().getFullYear();

  // Cookie columns are stored bare; normalizeCookieValue keeps a quoted or
  // "NAME="-prefixed legacy paste from breaking the Cookie header.
  const cookies = resolveCookies({
    espnS2: connection.espn_s2 as string | null | undefined,
    swid: connection.swid as string | null | undefined,
  }).cookies;

  let rawSnapshot: unknown = null;

  try {
    // 2. Instantiate adapter with cookies if available.
    const adapter = new ESPNAdapter(cookies ? { ...cookies } : {});

    // 3. Fetch league + members + rosters in parallel. Matchups need the
    //    league's current scoring period, so they follow the league read —
    //    getMatchups without a period filter returns the whole season.
    const [league, members, rosters] = await Promise.all([
      adapter.getLeague(leagueIdNumber, seasonYear),
      adapter.getMembers(leagueIdNumber, seasonYear),
      adapter.getRosters(leagueIdNumber, seasonYear),
    ]);
    const matchups = await adapter.getMatchups(
      leagueIdNumber,
      seasonYear,
      league.scoringPeriodId,
    );
    let myRole: 'Commissioner' | 'Member' | null = null;
    if (cookies) {
      try {
        myRole = await adapter.getMyRole(leagueIdNumber, seasonYear);
      } catch {
        // ignore
      }
    }
    rawSnapshot = { league, members, rosters, matchups, myRole };

    // 4. Bump last_synced_at, and adopt the season ESPN reports when we had to
    //    guess it (rows written before the season_year column existed).
    const updates: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
    };
    if (connection.season_year !== league.seasonYear) {
      updates.season_year = league.seasonYear;
    }
    const { error: updateError } = await db
      .from('integration_connections')
      .update(updates)
      .eq('id', connectionId);

    if (updateError) {
      throw new Error(`Failed to update last_synced_at: ${updateError.message}`);
    }

    // 5a. Success log row.
    const { data: logRow, error: logError } = await db
      .from('integration_sync_log')
      .insert({
        connection_id: connectionId,
        status: 'success',
        error_message: null,
        raw_snapshot: rawSnapshot,
      })
      .select('id')
      .single();

    if (logError) {
      throw new Error(`Failed to insert sync log: ${logError.message}`);
    }

    return logRow.id as string;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // If auth required, update connection status.
    if (err instanceof ESPNAuthRequiredError) {
      const { error: authError } = await db
        .from('integration_connections')
        .update({ status: 'auth_required' })
        .eq('id', connectionId);

      if (authError) {
        throw new Error(`Sync failed with auth error and status update failed: ${authError.message}`, {
          cause: err,
        });
      }
      // Surface the auth error.
      throw new Error(`ESPN authentication required for private league: ${message}`, { cause: err });
    }

    // 5b. Always record the failure as 'error', then rethrow the original.
    const { error: logError } = await db
      .from('integration_sync_log')
      .insert({
        connection_id: connectionId,
        status: 'error',
        error_message: message,
        raw_snapshot: rawSnapshot,
      });

    if (logError) {
      throw new Error(`Sync failed and error log insert failed: ${logError.message}`, {
        cause: err,
      });
    }

    throw err;
  }
}
