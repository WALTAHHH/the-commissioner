/**
 * One-off live verification script for the Sleeper adapter (no test runner —
 * the repo has none). Run with:
 *
 *   npx tsx src/lib/integrations/sleeper/adapter.test.ts
 *
 * What it does:
 *  1. Calls all three adapter methods against the card-specified league ID
 *     1048258981634482176 and logs the result. NOTE: the real Sleeper API
 *     responds HTTP 404 for this ID (verified live 2026-11-13; the original
 *     spec fixture is no longer reachable), so the expected outcome here is
 *     the typed SleeperNotFoundError — which doubles as the 404-handling
 *     check.
 *  2. Calls the same methods against a known-good public league
 *     (289646328504385536, "Sleeper Friends League") and asserts the
 *     normalized shapes, so "valid data" is actually proven end-to-end.
 *
 * Exits 1 if any assertion fails.
 */
import {
  SleeperAdapter,
  SleeperApiError,
  SleeperNotFoundError,
} from './adapter';

const SPEC_LEAGUE_ID = '1048258981634482176';
const LIVE_LEAGUE_ID = '289646328504385536';

const adapter = new SleeperAdapter();

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function expectThrowsNotFound(
  name: string,
  call: () => Promise<unknown>
): Promise<void> {
  try {
    const result = await call();
    console.log(`  ${name}(${SPEC_LEAGUE_ID}) ->`, JSON.stringify(result));
    check(`${name} unexpectedly returned data`, false);
  } catch (err) {
    console.log(
      `  ${name}(${SPEC_LEAGUE_ID}) threw:`,
      (err as Error).name,
      '-',
      (err as Error).message
    );
    check(
      `${name} rejects unknown league with SleeperNotFoundError (statusCode 404)`,
      err instanceof SleeperNotFoundError &&
        err instanceof SleeperApiError &&
        err.statusCode === 404
    );
  }
}

async function main(): Promise<void> {
  console.log(`\n=== 1. Spec league ID ${SPEC_LEAGUE_ID} (unknown-league path) ===`);
  console.log(
    '  Live API behavior (probed 2026-11-13): /league/<id> and /league/<id>/rosters -> HTTP 404 body `null`;' +
      ' /league/<id>/users -> HTTP 200 body `[]`.\n' +
      '  Adapter contract: 404 (or 200 `null`) -> SleeperNotFoundError; a well-formed empty array is returned as-is.\n'
  );

  await expectThrowsNotFound('getLeague', () => adapter.getLeague(SPEC_LEAGUE_ID));
  await expectThrowsNotFound('getRosters', () => adapter.getRosters(SPEC_LEAGUE_ID));
  try {
    const members = await adapter.getMembers(SPEC_LEAGUE_ID);
    console.log(`  getMembers(${SPEC_LEAGUE_ID}) ->`, JSON.stringify(members));
    check('getMembers returns [] for unknown league (API returns 200 empty array)', Array.isArray(members) && members.length === 0);
  } catch (err) {
    console.log(`  getMembers(${SPEC_LEAGUE_ID}) threw:`, (err as Error).message);
    check('getMembers unexpectedly threw for unknown league', false);
  }

  console.log(`\n=== 2. Live league ID ${LIVE_LEAGUE_ID} (happy path) ===`);
  const league = await adapter.getLeague(LIVE_LEAGUE_ID);
  console.log('  getLeague ->', {
    externalId: league.externalId,
    name: league.name,
    status: league.status,
    sport: league.sport,
    season: league.season,
    settingsKeys: Object.keys(league.settings).length,
    hasRaw: Boolean(league.raw),
  });
  check('league.externalId matches requested ID', league.externalId === LIVE_LEAGUE_ID, league.externalId);
  check('league.name is non-empty string', typeof league.name === 'string' && league.name.length > 0, league.name);
  check('league.status is non-empty string', typeof league.status === 'string' && league.status.length > 0, league.status);
  check('league.sport === "nfl"', league.sport === 'nfl', league.sport);
  check('league.scoringSettings is an object', typeof league.scoringSettings === 'object');
  check('league.raw preserved for snapshots', typeof league.raw?.name === 'string');

  const members = await adapter.getMembers(LIVE_LEAGUE_ID);
  console.log(`  getMembers -> ${members.length} members; first:`, members[0] && {
    externalId: members[0].externalId,
    displayName: members[0].displayName,
    isOwner: members[0].isOwner,
    leagueExternalId: members[0].leagueExternalId,
  });
  check('members is a non-empty array', Array.isArray(members) && members.length > 0, String(members.length));
  check(
    'every member has externalId + displayName',
    members.every(
      (m) =>
        typeof m.externalId === 'string' &&
        m.externalId.length > 0 &&
        typeof m.displayName === 'string'
    )
  );
  check(
    'every member is attributed to the requested league',
    members.every((m) => m.leagueExternalId === LIVE_LEAGUE_ID)
  );

  const rosters = await adapter.getRosters(LIVE_LEAGUE_ID);
  console.log(`  getRosters -> ${rosters.length} rosters; first:`, rosters[0] && {
    externalId: rosters[0].externalId,
    ownerExternalId: rosters[0].ownerExternalId,
    starters: rosters[0].starters.length,
    players: rosters[0].players.length,
  });
  check('rosters is a non-empty array', Array.isArray(rosters) && rosters.length > 0, String(rosters.length));
  check(
    'every roster has numeric externalId + ownerExternalId + array fields',
    rosters.every(
      (r) =>
        typeof r.externalId === 'number' &&
        typeof r.ownerExternalId === 'string' &&
        Array.isArray(r.starters) &&
        Array.isArray(r.players)
    )
  );
  check(
    'roster owners are a subset of league members',
    rosters.every((r) => members.some((m) => m.externalId === r.ownerExternalId))
  );

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Live verification script failed:', err);
  process.exit(1);
});
