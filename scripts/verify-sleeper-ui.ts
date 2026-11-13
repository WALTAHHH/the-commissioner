/**
 * One-off live verification for Sleeper-2 (no test runner — repo convention,
 * same as adapter.test.ts). Run with:
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/verify-sleeper-ui.ts
 *
 * Exercises the real modules the UI sits on:
 *  1. Sleeper existence check (known-live league) via the adapter.
 *  2. Connection insert via the same queries connectSleeper issues.
 *  3. Uniqueness: (league_id, provider) duplicate -> 23505.
 *  4. getProviderConnection / listLeagueConnections read helpers.
 *  5. syncSleeperLeague end-to-end + last_synced_at bump + sync log row.
 *  6. Disconnect update (status='disconnected').
 *  7. Reactivate update path.
 *  8. fetchSleeperSnapshot on the live league.
 * Deletes every row it creates (connection + log) in a finally block.
 */
import { db } from '../src/lib/db'
import {
  listLeagueConnections,
  getProviderConnection,
  fetchSleeperSnapshot,
  describeSleeperError,
} from '../src/lib/integrations/connections'
import { syncSleeperLeague } from '../src/lib/integrations/sleeper/sync'
import { SleeperAdapter, SleeperNotFoundError } from '../src/lib/integrations/sleeper/adapter'

const LIVE_LEAGUE_ID = '289646328504385536' // 'Sleeper Friends League', live-verified in Sleeper-1a
const BOGUS_LEAGUE_ID = '999999999999999999'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL'
  if (!ok) failures++
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  // Identity: the FK on leagues.commissioner_id needs a real auth.users row.
  // Reuse the first one, or create a throwaway (deleted in finally).
  let creatorId: string
  let tempUserId: string | null = null
  const usersRes = await db.auth.admin.listUsers({ page: 1, perPage: 1 })
  const firstUser = usersRes.data.users?.[0]
  if (firstUser) {
    creatorId = firstUser.id
  } else {
    const created = await db.auth.admin.createUser({
      email: `sleeper2-verify-${Date.now()}@example.com`,
      password: 'Verify-only!2026#temp',
      email_confirm: true,
    })
    if (created.error || !created.data.user) {
      console.error('Cannot create temp auth user:', created.error?.message)
      process.exit(1)
    }
    creatorId = created.data.user.id
    tempUserId = creatorId
  }

  // League: reuse any existing one, or seed a throwaway (deleted in finally).
  let ourLeagueId: string
  let tempLeagueId: string | null = null
  const { data: existingLeague, error: leagueLookupError } = await db
    .from('leagues')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (existingLeague) {
    ourLeagueId = existingLeague.id as string
  } else {
    const { data: newLeague, error: newLeagueError } = await db
      .from('leagues')
      .insert({
        name: 'Sleeper-2 verification league',
        slug: `sleeper2-verify-${Date.now()}`,
        sport: 'football',
        format: 'redraft',
        commissioner_id: creatorId,
      })
      .select('id')
      .single()
    if (newLeagueError || !newLeague) {
      console.error('Cannot seed temp league:', newLeagueError?.message ?? 'no row', leagueLookupError?.message ?? '')
      process.exit(1)
    }
    ourLeagueId = newLeague.id as string
    tempLeagueId = ourLeagueId
  }
  console.log(`Using league ${ourLeagueId}`)

  // Clean any leftover rows from previous aborted runs first.
  const { data: leftovers } = await db
    .from('integration_connections')
    .select('id')
    .eq('league_id', ourLeagueId)
    .eq('provider', 'sleeper')
  for (const row of (leftovers ?? []) as { id: string }[]) {
    await db.from('integration_sync_log').delete().eq('connection_id', row.id)
    await db.from('integration_connections').delete().eq('id', row.id)
  }

  const createdConnectionIds: string[] = []
  try {
    // 1. Sleeper existence check paths.
    const adapter = new SleeperAdapter()
    const league = await adapter.getLeague(LIVE_LEAGUE_ID)
    check('adapter.getLeague works for live league', league.name.length > 0, `"${league.name}" (${league.sport} ${league.season})`)
    let notFoundOk = false
    try {
      await adapter.getLeague(BOGUS_LEAGUE_ID)
    } catch (err) {
      notFoundOk = err instanceof SleeperNotFoundError
    }
    check('adapter.getLeague throws SleeperNotFoundError for bogus ID', notFoundOk,
      describeSleeperError(new SleeperNotFoundError('x')))

    // 2. Insert connection (connectSleeper's query shape).
    const { data: inserted, error: insertError } = await db
      .from('integration_connections')
      .insert({
        league_id: ourLeagueId,
        provider: 'sleeper',
        external_league_id: LIVE_LEAGUE_ID,
        status: 'active',
        created_by: creatorId,
      })
      .select('id, status, last_synced_at')
      .single()
    if (insertError || !inserted) {
      check('insert connection', false, insertError?.message ?? 'no row')
      return
    }
    const connectionId = inserted.id as string
    createdConnectionIds.push(connectionId)
    check('insert connection', true, connectionId)
    check('status defaults active when omitted path works (explicit active)', inserted.status === 'active')

    // 3. (league_id, provider) unique -> duplicate must be 23505.
    const { error: dupError } = await db
      .from('integration_connections')
      .insert({
        league_id: ourLeagueId,
        provider: 'sleeper',
        external_league_id: BOGUS_LEAGUE_ID,
        status: 'active',
        created_by: creatorId,
      })
    check('duplicate (league,provider) rejected with 23505', dupError?.code === '23505',
      dupError?.code ?? 'no error — constraint missing?')

    // 4. Read helpers.
    const conn = await getProviderConnection(ourLeagueId, 'sleeper')
    check('getProviderConnection returns the row', conn?.id === connectionId && conn?.status === 'active')
    check('lastSyncedAt null before first sync', conn?.lastSyncedAt === null)
    const list = await listLeagueConnections(ourLeagueId)
    check('listLeagueConnections includes it', list.some((c) => c.id === connectionId))

    // 5. Real sync end-to-end.
    const logId = await syncSleeperLeague(connectionId)
    check('syncSleeperLeague returns a log row id', typeof logId === 'string' && logId.length > 0, logId)
    const after = await getProviderConnection(ourLeagueId, 'sleeper')
    check('last_synced_at bumped by sync', after?.lastSyncedAt instanceof Date && !Number.isNaN(after.lastSyncedAt.getTime()),
      String(after?.lastSyncedAt))
    const { data: logRow } = await db
      .from('integration_sync_log')
      .select('status, error_message, raw_snapshot')
      .eq('id', logId)
      .maybeSingle()
    const log = logRow as { status: string; error_message: string | null; raw_snapshot: Record<string, unknown> } | null
    check('sync log row: success + snapshot', log?.status === 'success' && !!log?.raw_snapshot?.league,
      log?.error_message ?? undefined)

    // 6. Disconnect update.
    await db.from('integration_connections').update({ status: 'disconnected' }).eq('id', connectionId)
    const disc = await getProviderConnection(ourLeagueId, 'sleeper')
    check('disconnect sets status', disc?.status === 'disconnected')
    const listAfterDisc = await listLeagueConnections(ourLeagueId)
    check('hub list still shows disconnected row', listAfterDisc.some((c) => c.id === connectionId && c.status === 'disconnected'))

    // 7. Reactivate update (connectSleeper's disconnected-row path).
    await db
      .from('integration_connections')
      .update({ status: 'active', created_by: creatorId })
      .eq('id', connectionId)
    const react = await getProviderConnection(ourLeagueId, 'sleeper')
    check('reactivate restores active', react?.status === 'active')
    check('reactivate keeps last_synced_at history', react?.lastSyncedAt instanceof Date)

    // 8. Snapshot helper for the details card.
    const snap = await fetchSleeperSnapshot(LIVE_LEAGUE_ID)
    check('fetchSleeperSnapshot ok for live league', snap.ok === true && snap.snapshot.name === league.name,
      snap.ok ? `${snap.snapshot.name} · ${snap.snapshot.memberCount} members` : snap.reason)
    const snapBad = await fetchSleeperSnapshot(BOGUS_LEAGUE_ID)
    check('fetchSleeperSnapshot degrades with reason for bogus league',
      snapBad.ok === false && typeof (snapBad as { reason?: string }).reason === 'string' && (snapBad as { reason: string }).reason.includes('not found'),
      snapBad.ok ? '' : snapBad.reason)

    // (provider, external_league_id) claim check — same league re-insert is caught
    // by 23505 above; verify the cross-league claim query used by connectSleeper.
    const { data: claimed } = await db
      .from('integration_connections')
      .select('id, league_id')
      .eq('provider', 'sleeper')
      .eq('external_league_id', LIVE_LEAGUE_ID)
      .maybeSingle()
    check('external ID claim lookup finds our row', (claimed as { id: string })?.id === connectionId)
  } finally {
    for (const id of createdConnectionIds) {
      const { error: logDel } = await db.from('integration_sync_log').delete().eq('connection_id', id)
      const { error: connDel } = await db.from('integration_connections').delete().eq('id', id)
      console.log(`  cleanup: ${logDel?.message ?? 'logs deleted'}, ${connDel?.message ?? 'connection deleted'}`)
    }
    if (tempLeagueId) {
      await db.from('leagues').delete().eq('id', tempLeagueId)
      console.log('  cleanup: temp league deleted')
    }
    if (tempUserId) {
      await db.auth.admin.deleteUser(tempUserId)
      console.log('  cleanup: temp auth user deleted')
    }
    const { data: remaining } = await db
      .from('integration_connections')
      .select('id')
      .eq('league_id', ourLeagueId)
    check('cleanup complete', ((remaining ?? []) as unknown[]).length === 0)
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
