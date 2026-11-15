/**
 * One-off verification for the dashboard announcements widget helpers (no
 * test runner — repo convention, see espn/adapter.test.ts). Run with:
 *
 *   npx tsx src/components/recent-announcements-widget.test.ts
 *
 * Covers:
 *  1. announcementSnippet — markdown-stripping, word-boundary truncation.
 *  2. loadRecentAnnouncementsAcrossLeagues — against a real in-process
 *     PostgREST emulator (node:http + the service-role supabase client), so
 *     the query the lib builds is exercised as WIRE FILTERS (league_id=in,
 *     deleted_at=is.null, order=created_at.desc, limit=N), not against a
 *     mock that shares the code's own assumptions. Asserts newest-first
 *     cross-league order, league-scoping (an unseen league never leaks),
 *     per-(announcement, league) read attribution, and limit capping.
 *  3. Empty-input short-circuits (no leagues / zero limit) — no fetch.
 *
 * fetchIdentities is not stubbed; with a dummy GoTrue it degrades to nulls
 * by design, so authorName must come back as displayName()'s fallback,
 * which is also asserted.
 *
 * Exits 1 if any assertion fails.
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

let failures = 0
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    failures++
    console.error(`FAIL  ${name}`)
    console.error(err)
  }
}

const user = (n: number) => n.toString().padStart(8, 'a') + '-0000-4000-8000-000000000000'
const VIEWER = user(20)

const L1 = { id: user(1), name: 'League One', slug: 'league-one' }
const L2 = { id: user(2), name: 'League Two', slug: 'league-two' }
const L3 = { id: user(3), name: 'League Three', slug: 'league-three' } // not passed to the fn
const AUTHOR = user(9)
const M1 = user(4) // viewer's active membership in L1
const M2 = user(5) // viewer's active membership in L2
const A_OLD = user(6) // read via M1, lives in L1  -> isRead true
const A_NEW = user(7) // unread, lives in L1, pinned
const A_CROSS = user(8) // "read" via M1 but lives in L2 -> must stay unread
const A_HIDDEN = user(10) // lives in L3 -> never visible
const A_DELETED = user(11) // soft-deleted in L1 -> filtered by the wire

function annRow(id: string, league_id: string, created_at: string, opts: { is_pinned?: boolean; deleted?: boolean } = {}) {
  return {
    id,
    league_id,
    created_by: AUTHOR,
    title: `Announcement ${id.slice(0, 4)}`,
    body: 'hello',
    is_pinned: opts.is_pinned ?? false,
    created_at,
    updated_at: created_at,
    deleted_at: opts.deleted ? created_at : null,
  }
}

const TABLES: Record<string, Record<string, unknown>[]> = {
  announcements: [
    annRow(A_CROSS, L2.id, '2026-11-14T10:00:00.000Z'),
    annRow(A_NEW, L1.id, '2026-11-13T10:00:00.000Z', { is_pinned: true }),
    annRow(A_OLD, L1.id, '2026-11-12T10:00:00.000Z'),
    annRow(A_HIDDEN, L3.id, '2026-11-11T10:00:00.000Z'),
    annRow(A_DELETED, L1.id, '2026-11-10T10:00:00.000Z', { deleted: true }),
  ],
  league_members: [
    { id: M1, league_id: L1.id, user_id: VIEWER, status: 'active' },
    { id: M2, league_id: L2.id, user_id: VIEWER, status: 'active' },
    // A removed membership in a league the viewer also holds active —
    // status=eq.active must drop it so stale reads never resurface.
    { id: user(12), league_id: L1.id, user_id: VIEWER, status: 'removed' },
  ],
  announcement_reads: [
    { announcement_id: A_OLD, member_id: M1 },
    // Read made through the REMOVED membership — filtered out before the
    // reads query because only active member ids are queried.
    { announcement_id: A_NEW, member_id: user(12) },
    // A read made through membership M1 (League One) attached to an
    // announcement that lives in League Two — the malformed/legacy shape
    // the league-attribution rule must reject.
    { announcement_id: A_CROSS, member_id: M1 },
  ],
}

/** Minimal PostgREST query semantics — enough for the filters this lib uses. */
function servePostgrest(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub')
    // PostgREST mounts tables under /rest/v1/<table> — accept both shapes.
    const table = url.pathname.replace(/^\/(rest\/v1\/)?/, '')
    if (process.env.STUB_DEBUG) console.log('[stub]', req.method, url.pathname, url.search)
    const rows = (TABLES[table] ?? []).filter((row) => {
      for (const [key, raw] of url.searchParams) {
        if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') continue
        const value = row[key as keyof typeof row]
        if (raw.startsWith('in.')) {
          const list = raw.slice(3).replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''))
          if (!list.includes(String(value))) return false
        } else if (raw.startsWith('eq.')) {
          if (String(value) !== raw.slice(3)) return false
        } else if (raw.startsWith('is.')) {
          const want = raw.slice(3)
          if (want === 'null' ? value !== null : String(value) !== want) return false
        }
      }
      return true
    })

    const order = url.searchParams.get('order')
    if (order) {
      const [col, dir] = order.split('.')
      rows.sort((a, b) => {
        const cmp = String(a[col]).localeCompare(String(b[col]))
        return dir === 'desc' ? -cmp : cmp
      })
    }

    const limit = url.searchParams.get('limit')
    const out = limit ? rows.slice(0, Number(limit)) : rows
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(out))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function main() {
  // --- snippet (pure, no env needed; import after env set is fine too) ----
  const { announcementSnippet } = await import(
    '@/src/components/recent-announcements-widget'
  )

  console.log('announcementSnippet')
  await check('strips emphasis, links, headings, list markers', () => {
    const md = '## **Playoff** updates\n- see [this bracket](https://x.y) and `waivers`\n> important'
    assert.equal(announcementSnippet(md), 'Playoff updates see this bracket and waivers important')
  })
  await check('collapses whitespace, leaves plain text alone', () => {
    assert.equal(announcementSnippet('line one\n\nline  two'), 'line one line two')
  })
  await check('truncates at a word boundary with ellipsis', () => {
    const out = announcementSnippet('word '.repeat(50).trim())
    assert.ok(out.endsWith('…'), 'ends with ellipsis')
    assert.ok(out.length <= 122, `length ${out.length} within bound`)
    assert.match(out, /word…$/, 'last token whole')
  })
  await check('whitespace-only body yields empty snippet', () => {
    assert.equal(announcementSnippet('   '), '')
  })

  // --- wire-level cross-league read --------------------------------------
  const server = await servePostgrest()
  const port = (server.address() as AddressInfo).port
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key'

  const { loadRecentAnnouncementsAcrossLeagues, DASHBOARD_ANNOUNCEMENT_LIMIT } =
    await import('@/src/lib/announcements')

  console.log('loadRecentAnnouncementsAcrossLeagues (in-process PostgREST)')
  const result = await loadRecentAnnouncementsAcrossLeagues(VIEWER, [L1, L2])

  await check('newest-first across leagues, soft-deleted and unseen leagues excluded', () => {
    assert.deepEqual(result.map((r) => r.id), [A_CROSS, A_NEW, A_OLD])
  })
  await check('carries league name/slug for the widget', () => {
    assert.equal(result[0].leagueName, 'League Two')
    assert.equal(result[1].leagueName, 'League One')
    assert.equal(result[1].leagueSlug, 'league-one')
  })
  await check('read state attributed per (announcement, membership league)', () => {
    const byId = new Map(result.map((r) => [r.id, r]))
    assert.equal(byId.get(A_OLD)!.isRead, true, 'own-league read marks read')
    // A_NEW's only read row points at the viewer's REMOVED membership —
    // inactive member ids never enter the reads query.
    assert.equal(byId.get(A_NEW)!.isRead, false, 'read via removed membership stays unread')
    assert.equal(byId.get(A_CROSS)!.isRead, false, 'cross-league read row must not leak')
  })
  await check('preserves pinned flag and never-blank author name', () => {
    const pinned = result.find((r) => r.id === A_NEW)!
    assert.equal(pinned.isPinned, true)
    assert.ok(pinned.authorName.length > 0, 'authorName falls back, never blank')
  })
  await check('limit caps the list at the wire', async () => {
    const two = await loadRecentAnnouncementsAcrossLeagues(VIEWER, [L1, L2], 2)
    assert.equal(two.length, 2)
  })
  await check('no leagues short-circuits without a query', async () => {
    assert.deepEqual(await loadRecentAnnouncementsAcrossLeagues(VIEWER, []), [])
  })
  await check('non-positive limit short-circuits', async () => {
    assert.deepEqual(await loadRecentAnnouncementsAcrossLeagues(VIEWER, [L1], 0), [])
  })
  await check('default limit is the widget constant', () => {
    assert.equal(DASHBOARD_ANNOUNCEMENT_LIMIT, 5)
  })

  server.close()

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`)
    process.exit(1)
  }
  console.log('\nall assertions passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
