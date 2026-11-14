import { db } from '../../db'
import { ESPNAdapter, ESPNAuthRequiredError } from './adapter'
import { normalizeESPNUserId } from './mapping'
import { resolveCookies, type ESPNNormalizedCookies } from './snapshot'

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
    // 3b. Private leagues only: ESPN's `view=fll` is the sole FFL view that
    //     carries the per-member `isLeagueManager` flag, and it is
    //     caller-scoped — ESPN resolves it from the session behind the
    //     espn_s2/SWID cookies, so it answers "what am I in THIS league" for
    //     the connecting account. Store it so the UI can render the role from
    //     the snapshot without a second round-trip.
    let myRole: 'Commissioner' | 'Member' | null = null;
    if (cookies) {
      myRole = await fetchESPNMyRole(cookies, leagueIdNumber, seasonYear);
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

/** Same host + browser UA the ESPN adapter uses for every read. */
const ESPN_FFL_READS_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
const ESPN_FLL_TIMEOUT_MS = 10_000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Caller-scoped role lookup for a private ESPN league.
 *
 * `view=fll` is the only FFL view that sends `members[].isLeagueManager`, and
 * it is resolved from the authenticated session behind the espn_s2/SWID
 * cookies — so the answer belongs to the connecting account, not to whoever
 * later views the page. The views the main sync already requests (mTeam/
 * mSettings/mRoster/mMatchup) carry no manager flag at all, which is why this
 * extra round-trip exists.
 *
 * Fail-soft by contract: every failure path (network, timeout, non-2xx,
 * rejected cookies, undecodable body, viewer not in the member list) returns
 * null so a role probe can never turn a successful league sync into an error.
 * The caller stores that null as `myRole` and the UI falls back to the
 * snapshot-derived heuristics in ./mapping.ts.
 */
async function fetchESPNMyRole(
  cookies: ESPNNormalizedCookies,
  leagueId: number,
  seasonYear: number,
): Promise<'Commissioner' | 'Member' | null> {
  const me = normalizeESPNUserId(cookies.swid);
  if (!me) return null;

  const url = `${ESPN_FFL_READS_URL}/seasons/${seasonYear}/segments/0/leagues/${leagueId}?view=fll`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': BROWSER_UA,
        Cookie: `espn_s2=${cookies.espnS2}; SWID=${cookies.swid}`,
      },
      signal: AbortSignal.timeout(ESPN_FLL_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { members?: unknown };
    const members = Array.isArray(payload?.members) ? payload.members : [];
    for (const entry of members) {
      const member = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
      if (!member || normalizeESPNUserId(member.id) !== me) continue;
      if (member.isCoLeagueManager === true) return 'Member';
      // Only a real boolean settles this. A payload that omits the manager
      // flag tells us nothing — a stored null lets mapping.ts's fallback
      // heuristics answer instead of a guessed 'Member' overriding them.
      if (member.isLeagueManager === true || member.isCommissioner === true) {
        return 'Commissioner';
      }
      return member.isLeagueManager === false || member.isCommissioner === false
        ? 'Member'
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
