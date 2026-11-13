import type {
  RawSleeperLeague,
  RawSleeperUser,
  RawSleeperRoster,
  SleeperLeague,
  SleeperMember,
  SleeperRoster,
} from './types';

/**
 * Maps raw Sleeper API payloads to the normalized internal types.
 * Pure functions — no fetching, no DB.
 */

/**
 * Convert raw Sleeper league response to a normalized league.
 * @param externalId The Sleeper league ID (the raw league payload does not
 *   include its own ID, so it must be passed in).
 * @param raw Raw league object from the API.
 */
export function normalizeLeague(
  externalId: string,
  raw: RawSleeperLeague
): SleeperLeague {
  return {
    externalId,
    name: raw.name,
    status: raw.status,
    sport: raw.sport,
    season: raw.season,
    avatar: raw.avatar,
    metadata: raw.metadata,
    settings: raw.settings,
    scoringSettings: raw.scoring_settings,
    raw,
  };
}

/**
 * Convert a raw Sleeper user (member) response to a normalized member.
 */
export function normalizeMember(raw: RawSleeperUser): SleeperMember {
  return {
    externalId: raw.user_id,
    displayName: raw.display_name,
    avatar: raw.avatar,
    isOwner: raw.is_owner ?? false,
    metadata: raw.metadata,
    leagueExternalId: raw.league_id,
    raw,
  };
}

/**
 * Convert a raw Sleeper roster response to a normalized roster.
 */
export function normalizeRoster(raw: RawSleeperRoster): SleeperRoster {
  return {
    externalId: raw.roster_id,
    ownerExternalId: raw.owner_id,
    leagueExternalId: raw.league_id,
    starters: raw.starters,
    players: raw.players,
    metadata: raw.metadata,
    settings: raw.settings,
    raw,
  };
}

/**
 * Batch normalization helpers
 */
export function normalizeLeagues(
  data: Array<{ externalId: string; raw: RawSleeperLeague }>
): SleeperLeague[] {
  return data.map(({ externalId, raw }) => normalizeLeague(externalId, raw));
}

export function normalizeMembers(raws: RawSleeperUser[]): SleeperMember[] {
  return raws.map(normalizeMember);
}

export function normalizeRosters(raws: RawSleeperRoster[]): SleeperRoster[] {
  return raws.map(normalizeRoster);
}
