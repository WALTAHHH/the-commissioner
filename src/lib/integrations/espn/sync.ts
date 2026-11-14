import { db } from '../../db';
import { ESPNAdapter, ESPNAuthRequiredError } from './adapter';

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

  const externalLeagueId = String(connection.external_league_id);
  const cookies = connection.espn_s2 && connection.swid
    ? { espnS2: connection.espn_s2, swid: connection.swid }
    : undefined;

  let rawSnapshot: unknown = null;

  try {
    // 2. Instantiate adapter with cookies if available.
    const adapter = new ESPNAdapter(cookies);

    // 3. Fetch all endpoints from ESPN in parallel.
    const [league, members, rosters, matchups] = await Promise.all([
      adapter.getLeague(externalLeagueId),
      adapter.getMembers(externalLeagueId),
      adapter.getRosters(externalLeagueId),
      adapter.getCurrentWeekMatchups(externalLeagueId),
    ]);
    rawSnapshot = { league, members, rosters, matchups };

    // 4. Bump last_synced_at.
    const { error: updateError } = await db
      .from('integration_connections')
      .update({ last_synced_at: new Date().toISOString() })
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