/**
 * Sleeper integration types.
 *
 * Two layers:
 *  - `RawSleeper*`  — exactly what api.sleeper.app returns (snake_case, nullable).
 *  - `SleeperLeague` / `SleeperMember` / `SleeperRoster` — normalized internal
 *    shapes used by the rest of the app. The original raw payload is kept on
 *    each object (`raw`) so sync jobs can snapshot it without a second fetch.
 */

/**
 * Raw Sleeper API response types (as returned by the API)
 */

export interface RawSleeperLeague {
  name: string;
  status: string;
  metadata: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  avatar: string | null;
  company_id: string | null;
  shard: number;
  season: string;
  season_type: string;
  sport: string;
  scoring_settings: Record<string, unknown>;
  // Note: league_id is not included in the league endpoint response
}

export interface RawSleeperUser {
  avatar: string | null;
  display_name: string;
  is_bot: boolean | null;
  is_owner: boolean | null;
  league_id: string;
  metadata: Record<string, unknown> | null;
  settings: unknown | null;
  user_id: string;
}

export interface RawSleeperRoster {
  co_owners: string[] | null;
  keepers: unknown | null;
  league_id: string;
  metadata: Record<string, unknown> | null;
  owner_id: string;
  player_map: unknown | null;
  players: string[];
  reserve: unknown | null;
  roster_id: number;
  settings: Record<string, unknown>;
  starters: string[];
  taxi: unknown | null;
}

/**
 * Normalized internal types (used across the application)
 */

export interface SleeperLeague {
  /** Sleeper league ID. Not present on the raw league payload — passed in by the adapter. */
  externalId: string;
  name: string;
  status: string;
  sport: string;
  season: string;
  avatar: string | null;
  metadata: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  scoringSettings: Record<string, unknown>;
  /** Original API payload, kept for sync snapshots. */
  raw: RawSleeperLeague;
}

export interface SleeperMember {
  /** Sleeper user_id */
  externalId: string;
  displayName: string;
  avatar: string | null;
  isOwner: boolean;
  metadata: Record<string, unknown> | null;
  /** League this member belongs to (from the raw payload). */
  leagueExternalId: string;
  /** Original API payload, kept for sync snapshots. */
  raw: RawSleeperUser;
}

export interface SleeperRoster {
  /** Sleeper roster_id (numeric on the API). */
  externalId: number;
  /** Sleeper user_id of the roster owner. */
  ownerExternalId: string;
  leagueExternalId: string;
  starters: string[];
  players: string[];
  metadata: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  /** Original API payload, kept for sync snapshots. */
  raw: RawSleeperRoster;
}

/**
 * Union type for normalized data
 */
export type NormalizedSleeperData =
  | { type: 'league'; data: SleeperLeague }
  | { type: 'member'; data: SleeperMember }
  | { type: 'roster'; data: SleeperRoster };

/**
 * @deprecated Use `SleeperLeague`. Kept as an alias so existing imports keep
 * compiling while callers migrate.
 */
export type NormalizedLeague = SleeperLeague;
/** @deprecated Use `SleeperMember`. */
export type NormalizedMember = SleeperMember;
/** @deprecated Use `SleeperRoster`. */
export type NormalizedRoster = SleeperRoster;
