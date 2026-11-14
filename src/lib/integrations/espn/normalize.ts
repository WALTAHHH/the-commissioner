/**
 * Maps raw ESPN FFL payloads onto the normalized `ESPN*` types.
 *
 * Every function is pure and tolerates missing keys: ESPN's response shape
 * depends on which `view` params were requested (and drifts over time), so
 * nothing here assumes a field exists.
 */
import type {
  ESPNDraft,
  ESPNDraftPick,
  ESPNLeague,
  ESPNMatchup,
  ESPNMatchupWinner,
  ESPNMember,
  ESPNRoster,
  ESPNRosterPlayer,
  RawESPNLeaguePayload,
  RawESPNDraftDetail,
  RawESPNRosterEntry,
  RawESPNTeam,
} from './types';

/**
 * `defaultPositionId` (player-position namespace) → position text.
 * Verified live against league 1241838 / 2024 (QB=1, RB=2, WR=3, TE=4,
 * K=5 names, D/ST=16 unit names). IDP position ids are not in this map and
 * decode to null (raw `positionId` is always preserved instead).
 */
export const ESPN_DEFAULT_POSITION_BY_ID: Readonly<Record<number, string>> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST',
};

export function normalizeLeague(
  payload: RawESPNLeaguePayload,
  seasonYear: number
): ESPNLeague {
  const settings = payload.settings ?? {};
  const teams = payload.teams ?? [];

  return {
    id: payload.id ?? 0,
    name: settings.name ?? '',
    seasonYear: payload.seasonId ?? seasonYear,
    scoringPeriodId: payload.scoringPeriodId ?? 0,
    isPublic: settings.isPublic === true,
    teamCount: settings.size ?? teams.length,
    scoringFormat: settings.scoringSettings?.scoringType ?? null,
    raw: payload,
  };
}

/**
 * Members are owner⇄team rows: ESPN's `members` array has no team link, and
 * `teams[].owners` is the ownership edge. We emit one row per owner-team
 * pair (a member owning two teams appears twice) plus one `teamId: null`
 * row for any member not on any team.
 */
export function normalizeMembers(payload: RawESPNLeaguePayload): ESPNMember[] {
  const members = payload.members ?? [];
  const teams = payload.teams ?? [];

  const byUserId = new Map<string, (typeof members)[number]>();
  for (const m of members) {
    if (m.id !== undefined) byUserId.set(m.id, m);
  }

  const rows: ESPNMember[] = [];
  const attached = new Set<string>();

  for (const team of teams) {
    const ownerIds = new Set<string>(team.owners ?? []);
    if (team.primaryOwner) ownerIds.add(team.primaryOwner);

    for (const ownerId of ownerIds) {
      const member = byUserId.get(ownerId);
      if (!member) continue; // owner id not present in the members list
      attached.add(ownerId);
      rows.push({
        id: ownerId,
        displayName: displayNameOf(member),
        firstName: member.firstName ?? null,
        lastName: member.lastName ?? null,
        teamId: team.id ?? null,
        teamName: team.name ?? null,
        teamAbbrev: team.abbrev ?? null,
      });
    }
  }

  for (const member of members) {
    if (member.id === undefined || attached.has(member.id)) continue;
    rows.push({
      id: member.id,
      displayName: displayNameOf(member),
      firstName: member.firstName ?? null,
      lastName: member.lastName ?? null,
      teamId: null,
      teamName: null,
      teamAbbrev: null,
    });
  }

  return rows;
}

function displayNameOf(member: {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  id?: string;
}): string {
  if (member.displayName) return member.displayName;
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
  return name !== '' ? name : `User ${member.id ?? '?'}`;
}

export function normalizeRosters(payload: RawESPNLeaguePayload): ESPNRoster[] {
  const teams = payload.teams ?? [];
  return teams
    .filter((team): team is RawESPNTeam & { id: number } => team.id !== undefined)
    .map((team) => ({
      teamId: team.id,
      teamName: team.name ?? null,
      players: (team.roster?.entries ?? []).map(normalizeRosterEntry),
    }));
}

function normalizeRosterEntry(entry: RawESPNRosterEntry): ESPNRosterPlayer {
  // Prefer the embedded player object; fall back to the bare id when the
  // roster view was requested without player data (ESPN sometimes strips it).
  const player = entry.playerPoolEntry?.player;
  const playerId = player?.id ?? entry.playerId ?? 0;
  const positionId = player?.defaultPositionId ?? null;

  return {
    id: playerId,
    fullName:
      player?.fullName ?? (entry.playerId !== undefined ? `Player ${entry.playerId}` : ''),
    position:
      positionId !== null && positionId !== undefined
        ? ESPN_DEFAULT_POSITION_BY_ID[positionId] ?? null
        : null,
    positionId,
    acquisitionType: entry.acquisitionType ?? null,
  };
}

export function normalizeMatchups(
  payload: RawESPNLeaguePayload,
  matchupPeriodId?: number
): ESPNMatchup[] {
  const schedule = payload.schedule ?? payload.matchups ?? [];

  const rows: ESPNMatchup[] = [];
  for (const game of schedule) {
    // mScoreboard-style rows can omit the period id; without it we cannot
    // place the game, so it is not a matchup we can hand to the app.
    if (game.matchupPeriodId === undefined) continue;
    if (matchupPeriodId !== undefined && game.matchupPeriodId !== matchupPeriodId) {
      continue;
    }
    rows.push({
      matchupPeriodId: game.matchupPeriodId,
      homeTeamId: game.home?.teamId ?? null,
      awayTeamId: game.away?.teamId ?? null,
      homeScore: game.home?.totalPoints ?? null,
      awayScore: game.away?.totalPoints ?? null,
      winner: normalizeWinner(game.winner),
    });
  }
  return rows;
}

function normalizeWinner(raw: string | null | undefined): ESPNMatchupWinner {
  switch (raw) {
    case 'HOME':
    case 'AWAY':
    case 'TIE':
      return raw;
    default:
      // 'UNDECIDED', absent, or any future ESPN value: treat as not-decided.
      return null;
  }
}

/**
 * Draft normalization. The current 2024+ FFL format omits player objects on
 * picks, so names are resolved best-effort:
 *  1. embedded `playerPoolEntry.player.fullName` (older format / other games)
 *  2. lookup in the name table built from the same payload's rosters
 *     (requires the caller to have requested `view=mRoster` alongside)
 *  3. null
 */
export function normalizeDraft(payload: RawESPNLeaguePayload): ESPNDraft {
  const draftDetail: RawESPNDraftDetail = payload.draftDetail ?? {};
  const rawPicks = draftDetail.picks ?? draftDetail.draftPicks ?? [];

  const nameTable = buildPlayerNameTable(payload);

  const picks: ESPNDraftPick[] = rawPicks.map((pick) => {
    const embeddedName = pick.playerPoolEntry?.player?.fullName;
    const playerId = pick.playerId ?? null;
    return {
      round: pick.round ?? pick.roundId ?? null,
      pick: pick.pick ?? pick.overallPickNumber ?? null,
      teamId: pick.teamId ?? null,
      playerId,
      playerName: embeddedName ?? (playerId !== null ? nameTable.get(playerId) ?? null : null),
    };
  });

  return {
    picks,
    isComplete: draftDetail.drafted === true && !draftDetail.inProgress,
    inProgress: draftDetail.inProgress === true,
    completeDate: typeof draftDetail.completeDate === 'string' ? draftDetail.completeDate : null,
  };
}

function buildPlayerNameTable(payload: RawESPNLeaguePayload): Map<number, string> {
  const names = new Map<number, string>();
  for (const team of payload.teams ?? []) {
    for (const entry of team.roster?.entries ?? []) {
      const player = entry.playerPoolEntry?.player;
      const id = player?.id ?? entry.playerId;
      if (typeof id === 'number' && typeof player?.fullName === 'string') {
        names.set(id, player.fullName);
      }
    }
  }
  return names;
}
