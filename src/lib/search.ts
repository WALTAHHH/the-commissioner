/**
 * League-scoped search read layer (Search-1).
 *
 * Server-only — never import from a client component. Same layering as
 * `src/lib/announcements.ts` / `src/lib/governance.ts`: the query runs through
 * the service-role client in `src/lib/db.ts` (which bypasses RLS, so the
 * `league_id` filter IS the tenant-isolation gate) and page access is gated by
 * `loadLeagueContext` in the page. Column names are the raw database names
 * (`league_id`, `updated_at`) — PostgREST has no ORM translation — and rows are
 * mapped to camelCase at this boundary.
 *
 * ## What "full-text" means here
 * Search is a case-insensitive substring match (`ilike`) over each source's
 * text columns, combined with a cross-column `or=(...)` logic-tree filter.
 * This is deliberately NOT a Postgres `tsvector`/GIN full-text index: adding
 * one needs a schema migration, and schema changes are gated on the
 * commissioner applying them by hand (see decisions.md → "SQL migration
 * protocol"). Substring search is shippable today with zero schema change and
 * is exactly right at league scale (dozens–hundreds of rows per table).
 * Upgrading to ranked FTS later is a migration + an RPC, not a rewrite of the
 * call sites: everything funnels through `searchLeague`.
 *
 * ## Scoping
 * Every source query carries `.eq('league_id', leagueId)`, so a row from
 * another league can never appear, and soft-deleted rows
 * (`deleted_at IS NOT NULL`) are filtered out exactly like the list readers do.
 *
 * ## Safety
 * The user's term is embedded in a PostgREST `or=(...)` logic tree, which is a
 * mini grammar where `,`, `(`, `)` and `"` are reserved. `escapeOrValue()`
 * neutralises those (and the escape char itself) by double-quoting the value,
 * so a term like `a,b(c)"d` cannot break the filter or smuggle a second
 * clause. PostgREST parameterises the value server-side, so there is no SQL
 * injection surface regardless. `%` and `_` are passed through as LIKE
 * wildcards on purpose (the term is a substring-pattern, not a literal).
 */

import { db } from '@/src/lib/db'

/** A search term shorter than this is not run (avoids a match-everything scan). */
export const SEARCH_MIN_QUERY_LENGTH = 2

/** Hard cap on the term length we forward to PostgREST. */
export const SEARCH_MAX_QUERY_LENGTH = 100

/** Default number of merged results returned to a caller. */
export const SEARCH_RESULT_LIMIT = 50

/** Per-source fetch window — bounds each table's contribution before merging. */
const PER_SOURCE_LIMIT = 25

/** Order the sections render in on the search page. */
export const SEARCH_GROUP_ORDER = [
  'Announcements',
  'Rules',
  'Governance',
  'History',
  'Finances',
] as const

export type SearchGroup = (typeof SEARCH_GROUP_ORDER)[number]

/** Fine-grained record kind, used for the per-result badge. */
export type SearchResultType =
  | 'announcement'
  | 'rule'
  | 'poll'
  | 'decision'
  | 'dispute'
  | 'season_record'
  | 'award'
  | 'recap'
  | 'obligation'
  | 'prize'

export type SearchResult = {
  id: string
  type: SearchResultType
  /** Section the result is listed under (see SEARCH_GROUP_ORDER). */
  group: SearchGroup
  /** Singular label for the result badge, e.g. 'Poll', 'Decision'. */
  label: string
  title: string
  /** Markdown-stripped excerpt centred on the first match. */
  snippet: string
  /** In-app link; always scoped to the searched league. */
  href: string
  /** ISO-8601 timestamp used for recency tie-breaking. */
  timestamp: string
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for the test, and safe on the client)
// ---------------------------------------------------------------------------

/**
 * Collapse whitespace and trim. Returns '' for a query that is only
 * whitespace. Does NOT enforce length — callers use `isSearchableQuery`.
 */
export function normalizeQuery(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim()
}

/** True when `query` is long enough (and short enough) to run. */
export function isSearchableQuery(query: string): boolean {
  const n = query.length
  return n >= SEARCH_MIN_QUERY_LENGTH && n <= SEARCH_MAX_QUERY_LENGTH
}

/**
 * Escape a raw term for use as a value inside a PostgREST `or=(...)` logic
 * tree. Backslashes and double quotes are backslash-escaped and the whole
 * value is wrapped in double quotes, so reserved grammar characters
 * (`,` `(` `)` `.`) inside the term are treated literally instead of
 * terminating the clause. Returns the *quoted* value, e.g.
 * `escapeOrValue('a,b') -> '"a,b"'`.
 */
export function escapeOrValue(term: string): string {
  const escaped = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

/**
 * Build a cross-column `ilike` filter for PostgREST's `.or()`: one
 * `col.ilike."%term%"` clause per column, joined with commas. Returns '' when
 * there is nothing to search, which callers treat as "no query".
 */
export function buildIlikeOrFilter(columns: readonly string[], term: string): string {
  if (columns.length === 0 || term.length === 0) return ''
  const value = escapeOrValue(`%${term}%`)
  return columns.map((column) => `${column}.ilike.${value}`).join(',')
}

/**
 * Strip the markdown constructs that appear in real bodies so a snippet never
 * shows raw syntax. Conservative truncation helper, not a parser — same spirit
 * as `announcementSnippet` in the dashboard widget, kept separate so the
 * server-only search layer does not import a component module.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s{1,}|\d+\.\s{1,})\s*/gm, '') // block markers
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .replace(/\s+/g, ' ') // collapse newlines/runs
    .trim()
}

/** How many characters of a body the snippet keeps. */
const SNIPPET_LENGTH = 160

/**
 * A one-line preview centred on the first occurrence of `term` (when present),
 * falling back to the head of the text. Word-boundary friendly: never cuts a
 * word it can avoid, and marks both ends with an ellipsis when trimmed.
 */
export function makeSnippet(text: string, term: string, max = SNIPPET_LENGTH): string {
  const plain = plainText(text)
  if (plain.length <= max) return plain

  const needle = term.toLowerCase()
  const at = needle ? plain.toLowerCase().indexOf(needle) : -1
  // Start far enough before the match that it sits comfortably inside the
  // window; if there is no match, just take the head.
  let start = at > max / 2 ? at - Math.floor(max / 2) : 0
  let end = Math.min(plain.length, start + max)
  // Prefer word boundaries at both edges.
  if (start > 0) {
    const space = plain.indexOf(' ', start)
    if (space !== -1 && space < end) start = space + 1
  }
  if (end < plain.length) {
    const space = plain.lastIndexOf(' ', end)
    if (space > start + 20) end = space
  }

  const slice = plain.slice(start, end).trim()
  return `${start > 0 ? '…' : ''}${slice}${end < plain.length ? '…' : ''}`
}

// ---------------------------------------------------------------------------
// Source table
// ---------------------------------------------------------------------------

type SearchRow = Record<string, unknown>

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

type SearchSource = {
  type: SearchResultType
  group: SearchGroup
  label: string
  table: string
  /** Text columns combined into the cross-column `or=(...)` filter. */
  columns: string[]
  select: string
  /** Soft-delete column that must be null for a row to be visible. */
  softDelete?: string
  /** Column used for newest-first ordering and the result timestamp. */
  timestampColumn: string
  title: (row: SearchRow) => string
  /** Column the snippet is derived from. */
  snippetColumn: string
  href: (leagueId: string, row: SearchRow) => string
}

/**
 * Every searchable record type in a league. Order is irrelevant to results
 * (they are ranked, then grouped) but kept close to SEARCH_GROUP_ORDER for
 * readability. Adding a source is a one-entry change: the query builder and
 * the page pick it up automatically.
 */
const SOURCES: SearchSource[] = [
  {
    type: 'announcement',
    group: 'Announcements',
    label: 'Announcement',
    table: 'announcements',
    columns: ['title', 'body'],
    select: 'id, title, body, created_at, updated_at',
    softDelete: 'deleted_at',
    timestampColumn: 'created_at',
    title: (r) => asString(r.title),
    snippetColumn: 'body',
    href: (leagueId) => `/leagues/${leagueId}/announcements`,
  },
  {
    type: 'rule',
    group: 'Rules',
    label: 'Rule',
    table: 'rules',
    columns: ['title', 'body'],
    select: 'id, title, body, created_at, updated_at',
    softDelete: 'deleted_at',
    timestampColumn: 'updated_at',
    title: (r) => asString(r.title),
    snippetColumn: 'body',
    href: (leagueId) => `/leagues/${leagueId}/rules`,
  },
  {
    type: 'poll',
    group: 'Governance',
    label: 'Poll',
    table: 'polls',
    columns: ['title', 'description'],
    select: 'id, title, description, status, created_at',
    timestampColumn: 'created_at',
    title: (r) => asString(r.title),
    snippetColumn: 'description',
    href: (leagueId, r) => `/leagues/${leagueId}/governance/polls/${asString(r.id)}`,
  },
  {
    type: 'decision',
    group: 'Governance',
    label: 'Decision',
    table: 'decisions',
    columns: ['title', 'description', 'outcome'],
    select: 'id, title, description, outcome, recorded_at',
    timestampColumn: 'recorded_at',
    title: (r) => asString(r.title) || 'Decision',
    snippetColumn: 'description',
    href: (leagueId) => `/leagues/${leagueId}/governance/decisions`,
  },
  {
    type: 'dispute',
    group: 'Governance',
    label: 'Dispute',
    table: 'disputes',
    columns: ['description', 'resolution'],
    select: 'id, description, resolution, status, created_at',
    timestampColumn: 'created_at',
    // Disputes have no title column — the description is the only headline.
    title: (r) => makeSnippet(asString(r.description) || 'Dispute', '', 80),
    snippetColumn: 'description',
    href: (leagueId) => `/leagues/${leagueId}/governance/disputes`,
  },
  {
    type: 'season_record',
    group: 'History',
    label: 'Season record',
    table: 'season_records',
    columns: ['champion_team_name', 'notes'],
    select: 'id, season_year, champion_team_name, notes, created_at',
    timestampColumn: 'created_at',
    title: (r) => `Season ${asString(r.season_year) || '?'} record`,
    snippetColumn: 'notes',
    href: (leagueId) => `/leagues/${leagueId}/history`,
  },
  {
    type: 'award',
    group: 'History',
    label: 'Award',
    table: 'league_awards',
    columns: ['award_name', 'description'],
    select: 'id, season_year, award_name, description, created_at',
    timestampColumn: 'created_at',
    title: (r) => asString(r.award_name) || 'Award',
    snippetColumn: 'description',
    href: (leagueId) => `/leagues/${leagueId}/history`,
  },
  {
    type: 'recap',
    group: 'History',
    label: 'Season recap',
    table: 'season_recaps',
    columns: ['body'],
    select: 'id, season_year, body, created_at, updated_at',
    timestampColumn: 'updated_at',
    title: (r) => `Season ${asString(r.season_year) || '?'} recap`,
    snippetColumn: 'body',
    href: (leagueId) => `/leagues/${leagueId}/history`,
  },
  {
    type: 'obligation',
    group: 'Finances',
    label: 'Obligation',
    table: 'financial_obligations',
    columns: ['description', 'payment_instructions'],
    select: 'id, description, payment_instructions, amount, created_at, updated_at',
    softDelete: 'deleted_at',
    timestampColumn: 'updated_at',
    title: (r) => asString(r.description) || 'Obligation',
    snippetColumn: 'description',
    href: (leagueId) => `/leagues/${leagueId}/finances`,
  },
  {
    type: 'prize',
    group: 'Finances',
    label: 'Prize',
    table: 'prize_structure',
    columns: ['description'],
    select: 'id, description, season_year, created_at',
    timestampColumn: 'created_at',
    title: (r) => asString(r.description) || 'Prize',
    snippetColumn: 'description',
    href: (leagueId) => `/leagues/${leagueId}/finances/prizes`,
  },
]

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

async function searchSource(
  source: SearchSource,
  leagueId: string,
  term: string,
): Promise<SearchResult[]> {
  const filter = buildIlikeOrFilter(source.columns, term)
  if (!filter) return []

  let query = db
    .from(source.table)
    .select(source.select)
    .eq('league_id', leagueId)
    .or(filter)

  if (source.softDelete) {
    query = query.is(source.softDelete, null)
  }

  const { data, error } = await query
    .order(source.timestampColumn, { ascending: false })
    .limit(PER_SOURCE_LIMIT)

  if (error) {
    // One failing source (e.g. a not-yet-applied migration) must never blank
    // the whole result set — degrade to "that section had no matches".
    console.error(`searchLeague ${source.table} query error:`, error)
    return []
  }

  return ((data ?? []) as unknown as SearchRow[]).map((row) => ({
    id: asString(row.id),
    type: source.type,
    group: source.group,
    label: source.label,
    title: source.title(row) || source.label,
    snippet: makeSnippet(asString(row[source.snippetColumn]), term),
    href: source.href(leagueId, row),
    timestamp: asString(row[source.timestampColumn]),
  }))
}

/**
 * Full-text-ish search across every searchable record type in one league.
 *
 * Runs one query per source in parallel; a source that errors contributes an
 * empty list rather than failing the whole search. Results are ranked by a
 * title-match boost, then newest-first, then capped at `limit`.
 *
 * Returns [] for a term below `SEARCH_MIN_QUERY_LENGTH` (or an empty/invalid
 * league id) without touching the database.
 */
export async function searchLeague(
  leagueId: string,
  rawQuery: string,
  options: { limit?: number } = {},
): Promise<SearchResult[]> {
  const term = normalizeQuery(rawQuery)
  if (!leagueId || !isSearchableQuery(term)) return []

  const limit = options.limit ?? SEARCH_RESULT_LIMIT
  if (limit <= 0) return []

  const perSource = await Promise.all(
    SOURCES.map((source) => searchSource(source, leagueId, term)),
  )

  const needle = term.toLowerCase()
  const merged = perSource.flat()

  merged.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(needle) ? 1 : 0
    const bTitle = b.title.toLowerCase().includes(needle) ? 1 : 0
    if (aTitle !== bTitle) return bTitle - aTitle
    // Newest first; a missing timestamp sorts last.
    return b.timestamp.localeCompare(a.timestamp)
  })

  return merged.slice(0, limit)
}

/**
 * Group results into the fixed section order for rendering. Sections with no
 * matches are omitted, so an empty return means "nothing matched".
 */
export function groupResults(
  results: SearchResult[],
): Array<{ group: SearchGroup; results: SearchResult[] }> {
  const buckets = new Map<SearchGroup, SearchResult[]>()
  for (const result of results) {
    const list = buckets.get(result.group) ?? []
    list.push(result)
    buckets.set(result.group, list)
  }
  return SEARCH_GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    results: buckets.get(group) as SearchResult[],
  }))
}
