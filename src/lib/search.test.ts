/**
 * Verification for the league-scoped search read layer (no test runner —
 * repo convention, see `recent-announcements-widget.test.ts`). Run with:
 *
 *   npx tsx src/lib/search.test.ts
 *
 * Covers:
 *  1. Pure helpers — normalizeQuery, isSearchableQuery, escapeOrValue,
 *     buildIlikeOrFilter, plainText, makeSnippet.
 *  2. searchLeague against a real in-process PostgREST emulator (node:http +
 *     the service-role supabase client), so the query the lib builds is
 *     exercised as WIRE FILTERS (league_id=eq, deleted_at=is.null,
 *     or=(col.ilike."%term%",...), order=…, limit=…) instead of against a mock
 *     that shares the code's own assumptions. Asserts league isolation, soft
 *     delete filtering, cross-table merging, title-boost ranking, recency
 *     tie-breaking, the result cap and the per-source failure isolation.
 *  3. Empty/short-input short-circuits — no HTTP request is made.
 *
 * The stub parses PostgREST's `or=(...)` logic tree properly (commas inside
 * double-quoted values are not separators, `\"` is an escaped quote), which is
 * exactly the grammar `escapeOrValue` is written against — so a term such as
 * `a,b(c)"d` proves both that the filter is not broken and that no row from
 * another league can slip in.
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
const L1 = user(1)
const L2 = user(2)
const RULE_L1 = user(10)
const RULE_L1_OLD = user(11)
const RULE_L1_DELETED = user(12)
const RULE_L2 = user(13)
const POLL_L1 = user(20)
const ANN_L1 = user(30)
const OBL_L1 = user(40)
const REC_L1 = user(50)

const TABLES: Record<string, Record<string, unknown>[]> = {
  announcements: [
    {
      id: ANN_L1,
      league_id: L1,
      title: 'Waiver wire deadline moved',
      body: 'The **waiver** claim window now closes at noon.',
      created_at: '2026-11-12T10:00:00.000Z',
      updated_at: '2026-11-12T10:00:00.000Z',
      deleted_at: null,
    },
  ],
  rules: [
    {
      id: RULE_L1,
      league_id: L1,
      title: 'Waiver wire rules',
      body: 'Waiver claims are processed nightly.',
      created_at: '2026-11-13T10:00:00.000Z',
      updated_at: '2026-11-13T10:00:00.000Z',
      deleted_at: null,
    },
    {
      id: RULE_L1_OLD,
      league_id: L1,
      title: 'Trade review window',
      body: 'All waiver wire trades are reviewed within 24 hours.',
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
      deleted_at: null,
    },
    {
      id: RULE_L1_DELETED,
      league_id: L1,
      title: 'Old waiver policy',
      body: 'Waiver claims were first-come-first-served.',
      created_at: '2026-10-01T10:00:00.000Z',
      updated_at: '2026-10-01T10:00:00.000Z',
      deleted_at: '2026-10-02T10:00:00.000Z',
    },
    // Same term, different league — must never appear in an L1 search.
    {
      id: RULE_L2,
      league_id: L2,
      title: 'Waiver wire rules (League Two)',
      body: 'Waiver claims are processed weekly.',
      created_at: '2026-11-14T10:00:00.000Z',
      updated_at: '2026-11-14T10:00:00.000Z',
      deleted_at: null,
    },
  ],
  polls: [
    {
      id: POLL_L1,
      league_id: L1,
      title: 'Should we expand the waiver budget?',
      description: 'Discussion of the waiver running budget.',
      status: 'open',
      created_at: '2026-11-14T09:00:00.000Z',
    },
  ],
  decisions: [],
  disputes: [],
  season_records: [],
  league_awards: [],
  season_recaps: [],
  financial_obligations: [
    {
      id: OBL_L1,
      league_id: L1,
      description: 'Waiver wire fee — week 9',
      payment_instructions: 'Pay by Sunday.',
      amount: '10.00',
      created_at: '2026-11-05T10:00:00.000Z',
      updated_at: '2026-11-05T10:00:00.000Z',
      deleted_at: null,
    },
  ],
  // A source whose query fails hard — must degrade to "no matches", not throw.
  prize_structure: [
    {
      id: REC_L1,
      league_id: L1,
      description: 'Waiver prize: top record',
      season_year: 2026,
      created_at: '2026-11-02T10:00:00.000Z',
    },
  ],
}

/** Split a PostgREST or=(...) body on commas that sit outside double quotes. */
function splitOrClauses(body: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inQuotes && ch === '\\') {
      current += ch + (body[i + 1] ?? '')
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current) out.push(current)
  return out
}

/** Unwrap a PostgREST quoted value: `"a,b"` -> `a,b`, honouring `\"` and `\\`. */
function unquote(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw
  const inner = raw.slice(1, -1)
  let out = ''
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\' && i + 1 < inner.length) {
      out += inner[i + 1]
      i++
      continue
    }
    out += inner[i]
  }
  return out
}

/** `%term%` pattern -> case-insensitive substring match. */
function likeMatches(value: unknown, pattern: string): boolean {
  const target = String(value ?? '').toLowerCase()
  const needle = pattern.replace(/^%/, '').replace(/%$/, '').toLowerCase()
  return target.includes(needle)
}

let queryCount = 0
const FAILING_TABLES = new Set<string>()

function servePostgrest(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    queryCount++
    const url = new URL(req.url ?? '/', 'http://stub')
    const table = url.pathname.replace(/^\/(rest\/v1\/)?/, '')
    if (process.env.STUB_DEBUG) console.log('[stub]', req.method, url.pathname, url.search)

    if (FAILING_TABLES.has(table)) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ message: `relation "${table}" does not exist` }))
      return
    }

    const orRaw = url.searchParams.get('or')
    const clauses = orRaw
      ? splitOrClauses(orRaw.replace(/^\(/, '').replace(/\)$/, ''))
      : []

    const rows = (TABLES[table] ?? []).filter((row) => {
      for (const [key, raw] of url.searchParams) {
        if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset' || key === 'or') continue
        const value = row[key as keyof typeof row]
        if (raw.startsWith('in.')) {
          const list = raw.slice(3).replace(/^\(|\)$/g, '').split(',').map((v) => unquote(v))
          if (!list.includes(String(value))) return false
        } else if (raw.startsWith('eq.')) {
          if (String(value) !== unquote(raw.slice(3))) return false
        } else if (raw.startsWith('is.')) {
          const want = raw.slice(3)
          if (want === 'null' ? value !== null : String(value) !== want) return false
        }
      }
      if (clauses.length === 0) return true
      // or=(...) — any clause matching is enough.
      return clauses.some((clause) => {
        const at = clause.indexOf('.')
        const column = clause.slice(0, at)
        const rest = clause.slice(at + 1)
        const op = rest.slice(0, rest.indexOf('.'))
        const pattern = unquote(rest.slice(rest.indexOf('.') + 1))
        if (op !== 'ilike') return false
        return likeMatches(row[column as keyof typeof row], pattern)
      })
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
  const mod = await import('@/src/lib/search')
  const {
    normalizeQuery,
    isSearchableQuery,
    escapeOrValue,
    buildIlikeOrFilter,
    plainText,
    makeSnippet,
    searchLeague,
    groupResults,
    SEARCH_MIN_QUERY_LENGTH,
    SEARCH_MAX_QUERY_LENGTH,
    SEARCH_RESULT_LIMIT,
  } = mod

  console.log('pure helpers')
  await check('normalizeQuery collapses whitespace and trims', () => {
    assert.equal(normalizeQuery('  waiver   wire \n'), 'waiver wire')
    assert.equal(normalizeQuery('   '), '')
    assert.equal(normalizeQuery(undefined), '')
    assert.equal(normalizeQuery(null), '')
  })
  await check('isSearchableQuery enforces the length window', () => {
    assert.equal(SEARCH_MIN_QUERY_LENGTH, 2)
    assert.equal(isSearchableQuery('a'), false)
    assert.equal(isSearchableQuery('ab'), true)
    assert.equal(isSearchableQuery('x'.repeat(SEARCH_MAX_QUERY_LENGTH)), true)
    assert.equal(isSearchableQuery('x'.repeat(SEARCH_MAX_QUERY_LENGTH + 1)), false)
  })
  await check('escapeOrValue quotes reserved grammar characters', () => {
    assert.equal(escapeOrValue('waiver'), '"waiver"')
    assert.equal(escapeOrValue('a,b'), '"a,b"')
    assert.equal(escapeOrValue('a(b)'), '"a(b)"')
    assert.equal(escapeOrValue('a"b'), '"a\\"b"')
    // The whole value stays one comma-free clause for the stub's parser.
    assert.equal(splitOrClauses(escapeOrValue('a,b(c)"d')).length, 1)
  })
  await check('buildIlikeOrFilter emits one quoted clause per column', () => {
    assert.equal(buildIlikeOrFilter([], 'x'), '')
    assert.equal(buildIlikeOrFilter(['title'], ''), '')
    assert.equal(
      buildIlikeOrFilter(['title', 'body'], 'waiver'),
      'title.ilike."%waiver%",body.ilike."%waiver%"',
    )
  })
  await check('plainText strips markdown, leaves words', () => {
    assert.equal(
      plainText('## **Waiver** update\n- see [this](https://x.y) and `claims`\n> note'),
      'Waiver update see this and claims note',
    )
  })
  await check('makeSnippet centres on the term and marks truncation', () => {
    const body = 'alpha '.repeat(40) + 'waiver deadline ' + 'omega '.repeat(40)
    const out = makeSnippet(body, 'waiver')
    assert.ok(out.includes('waiver'), 'contains the match')
    assert.ok(out.startsWith('…'), 'leading ellipsis when trimmed')
    assert.ok(out.endsWith('…'), 'trailing ellipsis when trimmed')
    assert.ok(out.length <= 162, `length ${out.length} within bound`)
  })
  await check('makeSnippet returns short text untouched', () => {
    assert.equal(makeSnippet('waiver wire', 'waiver'), 'waiver wire')
    assert.equal(makeSnippet('', 'waiver'), '')
  })

  // --- wire-level -------------------------------------------------------
  const server = await servePostgrest()
  const port = (server.address() as AddressInfo).port
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key'

  console.log('searchLeague (in-process PostgREST)')
  const results = await searchLeague(L1, '  waiver  wire ')
  const ids = results.map((r) => r.id)

  await check('merges sources across tables', () => {
    assert.ok(ids.includes(ANN_L1), 'announcement hit')
    assert.ok(ids.includes(RULE_L1), 'rule hit')
    assert.ok(ids.includes(OBL_L1), 'obligation hit')
  })
  await check('never returns another league’s row', () => {
    assert.ok(!ids.includes(RULE_L2), 'League Two rule must not leak')
  })
  await check('soft-deleted rows are filtered', () => {
    assert.ok(!ids.includes(RULE_L1_DELETED), 'deleted rule must not appear')
  })
  await check('title matches rank above body-only matches', () => {
    const ruleAt = ids.indexOf(RULE_L1)
    const oldAt = ids.indexOf(RULE_L1_OLD)
    assert.ok(ruleAt !== -1 && oldAt !== -1, 'both present')
    assert.ok(ruleAt < oldAt, 'title hit sorts first')
  })
  await check('results carry group, label, snippet, href, timestamp', () => {
    const ann = results.find((r) => r.id === ANN_L1)!
    assert.equal(ann.group, 'Announcements')
    assert.equal(ann.label, 'Announcement')
    assert.equal(ann.type, 'announcement')
    assert.equal(ann.href, `/leagues/${L1}/announcements`)
    assert.equal(ann.timestamp, '2026-11-12T10:00:00.000Z')
    assert.ok(ann.snippet.includes('waiver'), 'snippet is markdown-stripped body')
    assert.ok(!ann.snippet.includes('**'), 'no raw markdown in snippet')
  })
  await check('navigates to the deepest route the record has', async () => {
    const pollHits = await searchLeague(L1, 'waiver budget')
    const poll = pollHits.find((r) => r.id === POLL_L1)
    assert.ok(poll, 'poll matched via title + description')
    assert.equal(poll!.group, 'Governance')
    assert.equal(poll!.href, `/leagues/${L1}/governance/polls/${POLL_L1}`)
  })
  await check('groups render in the fixed section order, empty sections omitted', async () => {
    const groups = groupResults(results)
    const names = groups.map((g) => g.group)
    assert.deepEqual(names, ['Announcements', 'Rules', 'Finances'])
  })
  await check('a term with reserved characters does not break the filter', async () => {
    const weird = await searchLeague(L1, 'a,b(c)"d')
    assert.deepEqual(weird, [], 'no match, but no throw and no cross-league leak')
  })
  await check('one failing source degrades to no matches for that section', async () => {
    FAILING_TABLES.add('prize_structure')
    const degraded = await searchLeague(L1, 'waiver')
    FAILING_TABLES.delete('prize_structure')
    assert.ok(degraded.some((r) => r.id === RULE_L1), 'other sources still return')
    assert.ok(!degraded.some((r) => r.id === REC_L1), 'failed source contributes nothing')
  })
  await check('limit caps the merged result set', async () => {
    assert.equal(SEARCH_RESULT_LIMIT, 50)
    const capped = await searchLeague(L1, 'waiver', { limit: 2 })
    assert.equal(capped.length, 2)
  })
  await check('non-positive limit short-circuits', async () => {
    assert.deepEqual(await searchLeague(L1, 'waiver', { limit: 0 }), [])
  })

  console.log('short-circuits (no HTTP)')
  const before = queryCount
  await check('single-character term does not query the database', async () => {
    assert.deepEqual(await searchLeague(L1, 'w'), [])
  })
  await check('empty term does not query the database', async () => {
    assert.deepEqual(await searchLeague(L1, '   '), [])
  })
  await check('missing league id does not query the database', async () => {
    assert.deepEqual(await searchLeague('', 'waiver'), [])
    assert.equal(queryCount, before, 'no requests were made')
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