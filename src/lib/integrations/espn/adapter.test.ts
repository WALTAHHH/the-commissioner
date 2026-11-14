/**
 * One-off live verification script for the ESPN adapter (no test runner —
 * the repo has none). Run with:
 *
 *   npx tsx src/lib/integrations/espn/adapter.test.ts
 *
 * What it does:
 *  1. Calls all five adapter methods against the card-specified PUBLIC
 *     league 1241838 (season 2024) with no cookies and asserts the
 *     normalized shapes end-to-end.
 *  2. Calls the adapter against an unknown league id and checks the typed
 *     ESPNNotFoundError (404) path.
 *  3. Exercises the error hierarchy mapping (401/403/404/429/500) with the
 *     pure `errorForStatus` function — ESPN's 401-for-private-leagues path
 *     cannot be simulated without a real private league, so this proves the
 *     contract instead of the wire.
 *
 * Exits 1 if any assertion fails.
 */
import {
  ESPNAdapter,
  ESPNApiError,
  ESPNAuthRequiredError,
  ESPNNotFoundError,
  ESPNRateLimitError,
  errorForStatus,
} from './adapter';

const LEAGUE_ID = 1241838;
const SEASON_YEAR = 2024;
const BOGUS_LEAGUE_ID = 9999999;

const adapter = new ESPNAdapter();

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  console.log(`\n=== 1. Public league ${LEAGUE_ID} (${SEASON_YEAR}), no cookies ===\n`);

  // --- getLeague ---
  const league = await adapter.getLeague(LEAGUE_ID, SEASON_YEAR);
  console.log('  getLeague ->', {
    id: league.id,
    name: league.name,
    seasonYear: league.seasonYear,
    scoringPeriodId: league.scoringPeriodId,
    isPublic: league.isPublic,
    teamCount: league.teamCount,
    scoringFormat: league.scoringFormat,
  });
  check('league.id matches requested id', league.id === LEAGUE_ID, String(league.id));
  check('league.name exists (non-empty string)', typeof league.name === 'string' && league.name.length > 0, league.name);
  check('league.seasonYear is 2024', league.seasonYear === SEASON_YEAR);
  check('league.scoringPeriodId is a positive number', league.scoringPeriodId > 0);
  check('league.isPublic === true for a public league', league.isPublic === true);
  check('league.teamCount > 0', league.teamCount > 0, String(league.teamCount));
  check('league.scoringFormat is a non-empty string', typeof league.scoringFormat === 'string' && league.scoringFormat.length > 0, String(league.scoringFormat));
  check('league.raw preserved for snapshots', typeof league.raw === 'object' && league.raw !== null);

  // --- getMembers ---
  const members = await adapter.getMembers(LEAGUE_ID, SEASON_YEAR);
  console.log(`  getMembers -> ${members.length} rows; first:`, members[0] && {
    id: members[0].id,
    displayName: members[0].displayName,
    teamId: members[0].teamId,
    teamName: members[0].teamName,
    teamAbbrev: members[0].teamAbbrev,
  });
  check('members array is non-empty', Array.isArray(members) && members.length > 0, String(members.length));
  check(
    'every member has ESPN user id (string) + displayName',
    members.every((m) => typeof m.id === 'string' && m.id.length > 0 && typeof m.displayName === 'string' && m.displayName.length > 0)
  );
  check(
    'every member row is team-consistent (teamId <=> teamName <=> teamAbbrev all set or all null)',
    members.every(
      (m) =>
        (m.teamId === null && m.teamName === null && m.teamAbbrev === null) ||
        (typeof m.teamId === 'number' && typeof m.teamName === 'string' && typeof m.teamAbbrev === 'string')
    )
  );
  check(
    'at least one member is attached to a team',
    members.some((m) => m.teamId !== null)
  );
  check(
    'member user ids are GUID-shaped (ESPN format)',
    members.every((m) => m.id.startsWith('{') || /^\d+$/.test(m.id)),
    members[0]?.id
  );

  // --- getRosters ---
  const rosters = await adapter.getRosters(LEAGUE_ID, SEASON_YEAR);
  console.log(`  getRosters -> ${rosters.length} rosters; first:`, rosters[0] && {
    teamId: rosters[0].teamId,
    teamName: rosters[0].teamName,
    players: rosters[0].players.length,
    firstPlayer: rosters[0].players[0],
  });
  check('rosters array is non-empty', Array.isArray(rosters) && rosters.length > 0, String(rosters.length));
  check('roster count equals league.teamCount', rosters.length === league.teamCount, `${rosters.length} vs ${league.teamCount}`);
  check(
    'every roster player has id + non-empty fullName',
    rosters.every((r) =>
      r.players.every((p) => typeof p.id === 'number' && typeof p.fullName === 'string' && p.fullName.length > 0)
    )
  );
  check(
    'every roster has at least one drafted player',
    rosters.every((r) => r.players.some((p) => p.acquisitionType === 'DRAFT'))
  );
  check(
    'position text decodes for at least one QB (defaultPositionId=1 verified live)',
    rosters.some((r) => r.players.some((p) => p.position === 'QB' && p.positionId === 1))
  );

  // --- getMatchups ---
  const matchups = await adapter.getMatchups(LEAGUE_ID, SEASON_YEAR);
  const weeks = new Set(matchups.map((m) => m.matchupPeriodId));
  console.log(`  getMatchups -> ${matchups.length} games across ${weeks.size} matchup periods; sample:`, matchups[0]);
  check('matchups array is non-empty', matchups.length > 0, String(matchups.length));
  check(
    'every matchup has a winner in HOME|AWAY|TIE|null',
    matchups.every((m) => m.winner === 'HOME' || m.winner === 'AWAY' || m.winner === 'TIE' || m.winner === null)
  );
  check(
    'decided matchups have both team ids and numeric scores',
    matchups
      .filter((m) => m.winner === 'HOME' || m.winner === 'AWAY')
      .every((m) => typeof m.homeTeamId === 'number' && typeof m.awayTeamId === 'number' && typeof m.homeScore === 'number' && typeof m.awayScore === 'number')
  );
  check(
    'winner is consistent with scores on decided games',
    matchups
      .filter((m) => m.winner === 'HOME' || m.winner === 'AWAY')
      .every((m) => {
        const hs = m.homeScore ?? 0;
        const as = m.awayScore ?? 0;
        return m.winner === 'HOME' ? hs >= as : as >= hs;
      })
  );

  const week1 = await adapter.getMatchups(LEAGUE_ID, SEASON_YEAR, 1);
  console.log(`  getMatchups(scoringPeriodId=1) -> ${week1.length} games`);
  check('week filter returns only matchupPeriodId=1 games', week1.length > 0 && week1.every((m) => m.matchupPeriodId === 1));
  check('week filter is a strict subset of the full season', week1.length < matchups.length);
  check(
    'matchup team ids are league teams (rosters cross-join)',
    matchups.every((m) =>
      (m.homeTeamId === null || rosters.some((r) => r.teamId === m.homeTeamId)) &&
      (m.awayTeamId === null || rosters.some((r) => r.teamId === m.awayTeamId))
    )
  );

  // --- getDraft ---
  const draft = await adapter.getDraft(LEAGUE_ID, SEASON_YEAR);
  const firstNameResolved = draft.picks.find((p) => p.playerName !== null);
  console.log(`  getDraft -> ${draft.picks.length} picks; complete=${draft.isComplete}; first pick:`, draft.picks[0]);
  check('draft picks array is non-empty', draft.picks.length > 0, String(draft.picks.length));
  check('draft is marked complete for a finished season', draft.isComplete === true);
  check(
    'every pick has numeric round (via roundId) and overall pick number',
    draft.picks.every((p) => typeof p.round === 'number' && typeof p.pick === 'number')
  );
  check(
    'round numbers form a contiguous range starting at 1',
    (() => {
      const rounds = [...new Set(draft.picks.map((p) => p.round))].sort((a, b) => (a ?? 0) - (b ?? 0));
      return rounds.length > 0 && rounds[0] === 1 && rounds.every((r, i) => r === i + 1);
    })()
  );
  check(
    'pick #1 resolves a playerName via roster-union lookup (2024 format omits player objects)',
    draft.picks.some((p) => p.pick === 1 && typeof p.playerName === 'string' && p.playerName.length > 0),
    firstNameResolved ? `e.g. ${firstNameResolved.playerName}` : 'no names resolved'
  );
  check(
    'draft teamIds are league teams',
    draft.picks.every((p) => p.teamId === null || rosters.some((r) => r.teamId === p.teamId))
  );

  // --- 404 path (live) ---
  console.log('\n=== 2. Unknown league id (typed 404 path, live) ===\n');
  try {
    const bogus = await adapter.getLeague(BOGUS_LEAGUE_ID, SEASON_YEAR);
    console.log('  getLeague(bogus) ->', JSON.stringify(bogus).slice(0, 120));
    check('unknown league unexpectedly returned data', false);
  } catch (err) {
    console.log('  getLeague(bogus) threw:', (err as Error).name, '-', (err as Error).message);
    check(
      'unknown league rejects with ESPNNotFoundError (statusCode 404, instanceof ESPNApiError)',
      err instanceof ESPNNotFoundError && err instanceof ESPNApiError && err.statusCode === 404
    );
  }

  // --- error hierarchy mapping (no-network) ---
  console.log('\n=== 3. Error hierarchy mapping (pure; private-league 401 cannot be simulated) ===\n');
  const url = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2024/segments/0/leagues/1';
  const e401 = errorForStatus(401, url, false);
  const e401wC = errorForStatus(401, url, true);
  const e403 = errorForStatus(403, url, false);
  const e403wC = errorForStatus(403, url, true);
  const e404 = errorForStatus(404, url, false);
  const e429 = errorForStatus(429, url, false);
  const e500 = errorForStatus(500, url, false);
  check('401 without cookies -> ESPNAuthRequiredError', e401 instanceof ESPNAuthRequiredError && e401 instanceof ESPNApiError && e401.name === 'ESPNAuthRequiredError');
  check('401 message (no cookies) mentions cookies are required', /cookies are required/i.test(e401.message), e401.message);
  check('401 WITH cookies -> ESPNAuthRequiredError (invalid/expired variant)', e401wC instanceof ESPNAuthRequiredError && /expired or invalid/i.test(e401wC.message));
  check('403 without cookies -> ESPNAuthRequiredError (some ESPN edges 403 private leagues)', e403 instanceof ESPNAuthRequiredError);
  check('403 with cookies -> plain ESPNApiError (not an auth-required signal)', e403wC instanceof ESPNApiError && !(e403wC instanceof ESPNAuthRequiredError) && e403wC.statusCode === 403);
  check('404 -> ESPNNotFoundError', e404 instanceof ESPNNotFoundError && e404.statusCode === 404);
  check('429 -> ESPNRateLimitError', e429 instanceof ESPNRateLimitError && e429.statusCode === 429);
  check('500 -> base ESPNApiError only', !(e500 instanceof ESPNNotFoundError) && !(e500 instanceof ESPNRateLimitError) && !(e500 instanceof ESPNAuthRequiredError) && e500.statusCode === 500);

  const cookieAdapter = new ESPNAdapter({ espnS2: 'x'.repeat(64), swid: '{A3EBBDAE-5F79-46FF-86EF-7356ABA27F8E}' });
  check('adapter reports hasCookies when constructed with cookies', cookieAdapter.hasCookies === true);
  check('adapter reports no cookies by default', adapter.hasCookies === false);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Live verification script failed:', err);
  process.exit(1);
});
