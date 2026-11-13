import { SleeperAdapter } from './adapter';
import assert from 'assert';

// Use a known public Sleeper league ID for testing.
// This league must be publicly accessible (no API key required).
const TEST_LEAGUE_ID = '289646328504385536'; // real league from earlier

async function testAdapter() {
  const adapter = new SleeperAdapter();
  console.log('Testing SleeperAdapter with league', TEST_LEAGUE_ID);

  // Test league fetch
  const league = await adapter.getLeague(TEST_LEAGUE_ID);
  assert(league, 'League should be defined');
  assert.strictEqual(league.externalId, TEST_LEAGUE_ID);
  assert(typeof league.name === 'string', 'League name should be string');
  assert(league.sport === 'nfl', `Expected sport nfl, got ${league.sport}`);
  assert(league.season, 'Season should be defined');
  assert(league.status, 'Status should be defined');
  assert(league.raw, 'Raw league data should be present');
  assert(league.raw.settings, 'Raw settings should be present');
  assert(league.raw.scoring_settings, 'Raw scoring_settings should be present');
  console.log('✓ League fetch passed');

  // Test members fetch
  const members = await adapter.getMembers(TEST_LEAGUE_ID);
  assert(Array.isArray(members), 'Members should be an array');
  if (members.length > 0) {
    const member = members[0];
    assert(member.externalId, 'Member externalId should be defined');
    assert(member.displayName, 'Member displayName should be defined');
    assert.strictEqual(member.leagueExternalId, TEST_LEAGUE_ID);
    assert(member.raw, 'Raw member data should be present');
  }
  console.log(`✓ Members fetch passed (${members.length} members)`);

  // Test rosters fetch
  const rosters = await adapter.getRosters(TEST_LEAGUE_ID);
  assert(Array.isArray(rosters), 'Rosters should be an array');
  if (rosters.length > 0) {
    const roster = rosters[0];
    assert(typeof roster.externalId === 'number', 'Roster externalId should be number');
    assert(roster.ownerExternalId, 'Roster ownerExternalId should be defined');
    assert.strictEqual(roster.leagueExternalId, TEST_LEAGUE_ID);
    assert(Array.isArray(roster.starters), 'Starters should be array');
    assert(Array.isArray(roster.players), 'Players should be array');
    assert(roster.raw, 'Raw roster data should be present');
  }
  console.log(`✓ Rosters fetch passed (${rosters.length} rosters)`);

  console.log('All tests passed');
}

// Run if executed directly
if (require.main === module) {
  testAdapter().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

export default testAdapter;