import type {
  RawSleeperLeague,
  RawSleeperUser,
  RawSleeperRoster,
  NormalizedLeague,
  NormalizedMember,
  NormalizedRoster,
} from './types';

/**
 * Convert raw Sleeper league response to normalized league.
 * @param externalId The Sleeper league ID (not included in raw object)
 * @param raw Raw league object from API
 */
export function normalizeLeague(
  externalId: string,
  raw: RawSleeperLeague
): NormalizedLeague {
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
 * Convert raw Sleeper user (member) response to normalized member.
 */
export function normalizeMember(raw: RawSleeperUser): NormalizedMember {
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
 * Convert raw Sleeper roster response to normalized roster.
 */
export function normalizeRoster(raw: RawSleeperRoster): NormalizedRoster {
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
): NormalizedLeague[] {
  return data.map(({ externalId, raw }) => normalizeLeague(externalId, raw));
}

export function normalizeMembers(raws: RawSleeperUser[]): NormalizedMember[] {
  return raws.map(normalizeMember);
}

export function normalizeRosters(raws: RawSleeperRoster[]): NormalizedRoster[] {
  return raws.map(normalizeRoster);
}