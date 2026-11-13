import { db } from '../../db';
import { SleeperAdapter, SleeperApiError } from './adapter';
import type { NormalizedLeague, NormalizedMember, NormalizedRoster } from './types';

/**
 * Sync a Sleeper league by its integration connection ID.
 *
 * 1. Fetches the connection record to get external league ID.
 * 2. Uses SleeperAdapter to fetch league, members, rosters.
 * 3. Stores raw snapshot in integration_sync_log.
 * 4. Updates last_synced_at on the connection.
 *
 * Returns the sync log record ID.
 */
export async function syncSleeperLeague(connectionId: string): Promise<string> {
  const adapter = new SleeperAdapter();

  // 1. Fetch connection
  const { data: connection, error: connError } = await db
    .from('integration_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (connError) {
    throw new Error(`Connection not found: ${connError.message}`);
  }

  if (connection.provider !== 'sleeper') {
    throw new Error(`Connection provider is ${connection.provider}, expected 'sleeper'`);
  }

  const externalLeagueId = connection.external_league_id;
  const leagueId = connection.league_id;

  let syncLogId: string;
  let rawSnapshot: unknown;
  let syncStatus: 'success' | 'failure' | 'partial' = 'success';
  let errorMessage: string | null = null;

  try {
    // 2. Fetch data from Sleeper
    const [league, members, rosters] = await Promise.all([
      adapter.getLeague(externalLeagueId),
      adapter.getMembers(externalLeagueId),
      adapter.getRosters(externalLeagueId),
    ]);

    rawSnapshot = { league, members, rosters };

    // 3. Store raw snapshot in sync log
    const { data: logInsert, error: logError } = await db
      .from('integration_sync_log')
      .insert({
        connection_id: connectionId,
        status: 'success',
        error_message: null,
        raw_snapshot: rawSnapshot,
      })
      .select('id')
      .single();

    if (logError) throw new Error(`Failed to insert sync log: ${logError.message}`);
    syncLogId = logInsert.id;

    // 4. Update last_synced_at
    const { error: updateError } = await db
      .from('integration_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connectionId);

    if (updateError) {
      console.warn('Failed to update last_synced_at:', updateError);
      // non‑fatal, continue
    }

    return syncLogId;
  } catch (err) {
    syncStatus = 'failure';
    errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Determine partial failure: maybe some endpoints succeeded?
    if (err instanceof SleeperApiError && err.statusCode === 404) {
      syncStatus = 'partial'; // league not found but others may have succeeded?
    }

    // Insert failure log
    const { data: logInsert, error: logError } = await db
      .from('integration_sync_log')
      .insert({
        connection_id: connectionId,
        status: syncStatus,
        error_message: errorMessage,
        raw_snapshot: rawSnapshot ?? null,
      })
      .select('id')
      .single();

    if (logError) {
      // If even the log insert fails, throw original error
      throw new Error(`Sync failed and logging failed: ${logError.message}`, { cause: err });
    }
    syncLogId = logInsert.id;

    // Re‑throw the original error after logging
    throw err;
  }
}