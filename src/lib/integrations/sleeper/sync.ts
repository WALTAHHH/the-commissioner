import { db } from '../../db';
import { SleeperAdapter } from './adapter';

/**
 * Sync a Sleeper league connection.
 *
 * Flow (Sleeper-1b spec):
 *  1. Load the connection row from `integration_connections`.
 *  2. Fetch league + members + rosters through `SleeperAdapter`.
 *  3. Update `last_synced_at` on the connection.
 *  4. Write a row to `integration_sync_log` — `status: 'success'` with the raw
 *     snapshot on the happy path, `status: 'error'` with the message (and a
 *     rethrow) on any failure.
 *
 * Uses the Supabase JS client only (`db` from src/lib/db.ts, service-role).
 *
 * @returns the id of the `integration_sync_log` row that was written.
 */
export async function syncSleeperLeague(connectionId: string): Promise<string> {
  const adapter = new SleeperAdapter();

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
  if (connection.provider !== 'sleeper') {
    throw new Error(
      `Connection ${connectionId} has provider '${String(connection.provider)}', expected 'sleeper'`,
    );
  }

  const externalLeagueId = String(connection.external_league_id);
  let rawSnapshot: unknown = null;

  try {
    // 2. Fetch all three endpoints from Sleeper in parallel.
    const [league, members, rosters] = await Promise.all([
      adapter.getLeague(externalLeagueId),
      adapter.getMembers(externalLeagueId),
      adapter.getRosters(externalLeagueId),
    ]);
    rawSnapshot = { league, members, rosters };

    // 3. Bump last_synced_at. Fatal on failure: a connection left claiming a
    // staleness it never had is worse than a failed sync.
    const { error: updateError } = await db
      .from('integration_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connectionId);

    if (updateError) {
      throw new Error(`Failed to update last_synced_at: ${updateError.message}`);
    }

    // 4a. Success log row; raw snapshot kept so future normalization passes
    // don't need a second round of API calls.
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

    // 4b. Always record the failure as 'error', then rethrow the original.
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
