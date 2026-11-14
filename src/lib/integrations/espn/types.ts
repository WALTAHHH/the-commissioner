/**
 * ESPN Fantasy (FFL) integration types.
 *
 * Two layers, mirroring the Sleeper integration:
 *  - `RawESPN*`   — shapes of the undocumented ESPN read API
 *    (`lm-api-reads.fantasy.espn.com/apis/v3/games/ffl`). Field presence was
 *    verified live against public league 1241838 / season 2024 (2026-11-14);
 *    everything is optional-typed because ESPN omits keys depending on the
 *    `view` parameters used.
 *  - `ESPNLeague` / `ESPNMember` / `ESPNRoster` / `ESPNMatchup` / `ESPNDraft`
 *    — normalized internal shapes used by the rest of the app. The original
 *    payload is kept on the league-level objects (`raw`) so sync jobs can
 *    snapshot it without a second fetch.
 *
 * Namespace warning (verified live + community docs): ESPN uses TWO different
 * id namespaces that look similar and are NOT interchangeable:
 *  - `defaultPositionId` (player position namespace):
 *      1=QB 2=RB 3=WR 4=TE 5=K 16=D/ST (empirically confirmed on live data)
 *  - `lineupSlotId` / `eligibleSlots` (lineup-slot namespace):
 *      0=QB 2=RB 4=WR 6=TE 16=D/ST 17=K 20=BN 21=IR 23=FLEX ...
 * We decode `defaultPositionId` for roster players' position text.
 */

/**
 * Raw ESPN API response types.
 */

export interface RawESPNPlayer {
  id?: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  /** Player-position namespace — see file header. */
  defaultPositionId?: number | null;
  /** Lineup-slot namespace. */
  eligibleSlots?: number[];
  proTeamId?: number | null;
  injured?: boolean;
  injuryStatus?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface RawESPNPlayerPoolEntry {
  id?: number;
  player?: RawESPNPlayer;
  appliedStatTotal?: number;
  onTeamId?: number;
  status?: string;
  [key: string]: unknown;
}

export interface RawESPNRosterEntry {
  playerId?: number;
  /** Lineup slot the player currently occupies on this team. */
  lineupSlotId?: number | null;
  acquisitionType?: string; // 'DRAFT' | 'WAIVER' | 'FREE_AGENT' | 'TRADE' | ...
  acquisitionDate?: number; // unix ms
  acquisitionAmount?: number | null; // FAAB bid
  status?: string;
  playerPoolEntry?: RawESPNPlayerPoolEntry;
  [key: string]: unknown;
}

export interface RawESPNTeamRoster {
  entries?: RawESPNRosterEntry[];
  appliedStatTotal?: number;
  [key: string]: unknown;
}

export interface RawESPNMember {
  /** ESPN user id — GUID-style string, e.g. "{3A2C2DB2-...}". */
  id?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: unknown;
}

export interface RawESPNTeamRecord {
  wins?: number;
  losses?: number;
  ties?: number;
  percentage?: number;
  [key: string]: unknown;
}

export interface RawESPNTeam {
  id?: number;
  abbrev?: string;
  name?: string;
  /** ESPN user ids holding ownership of this team (can be >1 after trades). */
  owners?: string[];
  primaryOwner?: string;
  roster?: RawESPNTeamRoster;
  record?: RawESPNRecordSide;
  points?: number;
  playoffSeed?: number;
  rankFinal?: number;
  [key: string]: unknown;
}

/** ESPN nests team `record` as { overall: {...}, division: {...}, ... }. */
export interface RawESPNRecordSide {
  overall?: RawESPNTeamRecord;
  [key: string]: unknown;
}

export interface RawESPNSettings {
  name?: string;
  isPublic?: boolean;
  /** League size (number of teams). */
  size?: number;
  scoringSettings?: {
    /** 'H2H_POINTS' | 'H2H_CATEGORY' | 'SORENSON' | 'H2H_POINTS_FLEX' | ... */
    scoringType?: string;
    [key: string]: unknown;
  };
  rosterSettings?: { [key: string]: unknown };
  scheduleSettings?: { [key: string]: unknown };
  draftSettings?: { [key: string]: unknown };
  financeSettings?: { [key: string]: unknown };
  [key: string]: unknown;
}

/** One side of a schedule/matchup entry. */
export interface RawESPNMatchupSide {
  teamId?: number;
  totalPoints?: number;
  gamesPlayed?: number;
  [key: string]: unknown;
}

/**
 * One game within a matchup period. `view=mMatchup` puts these in the
 * top-level `schedule` array (all periods, one row per game).
 */
export interface RawESPNMatchup {
  id?: number;
  matchupPeriodId?: number;
  home?: RawESPNMatchupSide;
  away?: RawESPNMatchupSide;
  /** 'HOME' | 'AWAY' | 'TIE' | 'UNDECIDED' | absent. */
  winner?: string | null;
  [key: string]: unknown;
}

export interface RawESPNDraftPick {
  id?: number;
  /** Current format sends null/absent and uses `roundId` instead. */
  round?: number | null;
  roundId?: number | null;
  /** Current format sends null/absent and uses `overallPickNumber`. */
  pick?: number | null;
  overallPickNumber?: number | null;
  roundPickNumber?: number | null;
  teamId?: number;
  playerId?: number;
  nominatingTeamId?: number;
  bidAmount?: number | null;
  keeper?: boolean;
  /** Older ESPN responses embed the player here; the 2024 FFL format does not. */
  playerPoolEntry?: RawESPNPlayerPoolEntry;
  [key: string]: unknown;
}

export interface RawESPNDraftDetail {
  drafted?: boolean;
  inProgress?: boolean;
  completeDate?: string;
  picks?: RawESPNDraftPick[];
  /** Legacy key name seen on some games/seasons. */
  draftPicks?: RawESPNDraftPick[];
  [key: string]: unknown;
}

/**
 * The union of everything the league endpoint can return for the views this
 * adapter requests. Which keys appear depends on the `view` parameters.
 */
export interface RawESPNLeaguePayload {
  gameId?: number;
  id?: number;
  seasonId?: number;
  scoringPeriodId?: number;
  segmentId?: number;
  members?: RawESPNMember[];
  teams?: RawESPNTeam[];
  settings?: RawESPNSettings;
  schedule?: RawESPNMatchup[];
  /** Some sports/seasons key the matchup list as `matchups` instead. */
  matchups?: RawESPNMatchup[];
  draftDetail?: RawESPNDraftDetail;
  status?: { [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Normalized internal types (used across the application).
 */

export type ESPNMatchupWinner = 'HOME' | 'AWAY' | 'TIE' | null;

export interface ESPNLeague {
  /** ESPN league id (numeric). */
  id: number;
  name: string;
  seasonYear: number;
  scoringPeriodId: number;
  isPublic: boolean;
  teamCount: number;
  /** e.g. 'H2H_POINTS'; null when the payload predates settings access. */
  scoringFormat: string | null;
  /** Original API payload, kept for sync snapshots. */
  raw: RawESPNLeaguePayload;
}

export interface ESPNMember {
  /** ESPN user id (GUID-style string). */
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  /**
   * Team this membership row is attached to. Derived from `team.owners`.
   * A member owning two teams (post-trade) appears twice; a member with no
   * team appears once with `teamId: null`.
   */
  teamId: number | null;
  teamName: string | null;
  teamAbbrev: string | null;
}

export interface ESPNRosterPlayer {
  /** ESPN player id (D/ST units use negative ids). */
  id: number;
  fullName: string;
  /**
   * Position text decoded from `defaultPositionId` (QB/RB/WR/TE/K/D/ST).
   * null for ids outside the verified map (e.g. some IDP configurations) —
   * `positionId` keeps the raw value losslessly in that case.
   */
  position: string | null;
  /** Raw `defaultPositionId`; null when ESPN omitted the player object. */
  positionId: number | null;
  /** 'DRAFT' | 'WAIVER' | 'FREE_AGENT' | 'TRADE' | ... */
  acquisitionType: string | null;
}

export interface ESPNRoster {
  teamId: number;
  teamName: string | null;
  players: ESPNRosterPlayer[];
}

export interface ESPNMatchup {
  /** Matchup period (week) this game belongs to. */
  matchupPeriodId: number;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  /** null when still undecided (ESPN sends 'UNDECIDED' or omits the key). */
  winner: ESPNMatchupWinner;
}

export interface ESPNDraftPick {
  round: number | null;
  /** Overall pick number in the draft. */
  pick: number | null;
  teamId: number | null;
  playerId: number | null;
  /**
   * Best-effort resolved name: embedded `playerPoolEntry` if ESPN provides
   * it (older format), else a lookup against the league's current rosters.
   * null when the player is on no current roster (dropped mid-season).
   */
  playerName: string | null;
}

export interface ESPNDraft {
  picks: ESPNDraftPick[];
  isComplete: boolean;
  inProgress: boolean;
  /** ISO date of draft completion when present. */
  completeDate: string | null;
}
