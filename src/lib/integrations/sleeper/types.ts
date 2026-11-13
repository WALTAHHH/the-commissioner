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

export interface NormalizedLeague {
  externalId: string; // Sleeper league ID (must be passed separately)
  name: string;
  status: string;
  sport: string;
  season: string;
  avatar: string | null;
  metadata: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  scoringSettings: Record<string, unknown>;
  raw: RawSleeperLeague; // keep raw data for sync log
}

export interface NormalizedMember {
  externalId: string; // Sleeper user_id
  displayName: string;
  avatar: string | null;
  isOwner: boolean;
  metadata: Record<string, unknown> | null;
  leagueExternalId: string;
  raw: RawSleeperUser;
}

export interface NormalizedRoster {
  externalId: number; // Sleeper roster_id
  ownerExternalId: string; // Sleeper owner_id
  leagueExternalId: string;
  starters: string[];
  players: string[];
  metadata: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  raw: RawSleeperRoster;
}

/**
 * Union type for normalized data
 */
export type NormalizedSleeperData =
  | { type: 'league'; data: NormalizedLeague }
  | { type: 'member'; data: NormalizedMember }
  | { type: 'roster'; data: NormalizedRoster };