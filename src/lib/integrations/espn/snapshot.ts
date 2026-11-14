/**
 * Server-only ESPN connection readers for the ESPN-2 UI (t_1e9423de).
 *
 * Three jobs, all of which must stay on the server:
 *  1. Validate + normalise what the connect form submits (league ID, season
 *     year, and — for private leagues — the `espn_s2` / `SWID` cookies).
 *  2. Verify a league actually exists before we write a connection row, and
 *     translate the adapter's typed errors into the one sentence the UI shows.
 *  3. Read live league details for display, including for private leagues,
 *     where the cookies are needed to call ESPN at all.
 *
 * SECURITY: `fetchESPNConnectionSnapshot` is the only function here that
 * touches stored cookies. It loads the row itself (service-role `db`) and
 * returns ONLY display-safe fields, so cookie values never travel into a
 * view type, a page's props, or a client component. The rest of the app sees
 * at most a boolean `isPrivate`.
 */
import { db } from '@/src/lib/db'
import type { IntegrationConnectionRow } from '@/src/db/rows'
import {
  ESPNAdapter,
  ESPNApiError,
  ESPNAuthRequiredError,
  ESPNNotFoundError,
  ESPNRateLimitError,
  ESPNNetworkError,
} from './adapter'
import type { ESPNLeague } from './types'

export const ESPN_PROVIDER = 'espn'

/**
 * ESPN FFL league IDs are numeric and short (7-8 digits in the wild, e.g.
 * 1241838 — live-verified in the ESPN-1a adapter test). Anything else is a
 * typo, a pasted full URL, or the league's slug.
 */
const ESPN_LEAGUE_ID_PATTERN = /^\d{4,12}$/

/** Same window as the DB CHECK in 0013_espn_season_year.sql. */
export const MIN_SEASON_YEAR = 1999
export const MAX_SEASON_YEAR = 2100

export type ESPNCookieInput = {
  espnS2?: string | null
  swid?: string | null
}

/** Which failure mode an ESPN read hit — drives the UI's error copy. */
export type ESPNErrorKind = 'auth' | 'notfound' | 'ratelimit' | 'network' | 'api'

export type ESPNLeagueView = {
  name: string
  teamCount: number
  /** Current scoring period (week) ESPN reports for the season. */
  scoringPeriodId: number
  seasonYear: number
  /** false when ESPN marks the league private, or when we fetched with cookies. */
  isPublic: boolean
}

export type VerifyESPNResult =
  | { ok: true; league: ESPNLeagueView }
  | {
      ok: false
      /** User-facing sentence; never a stack or a full URL. */
      error: string
      /**
       * 'invalid' = we rejected it before calling ESPN; otherwise the adapter
       * error class that fired. Drives the UI's error styling/copy.
       */
      kind: 'invalid' | ESPNErrorKind
      /**
       * True when ESPN refused the league because no usable cookies came with
       * the request — the UI uses this to auto-reveal the cookie fields.
       */
      needsCookies: boolean
    }

export type ESPNNormalizedCookies = { espnS2: string; swid: string }

export function isESPNLeagueId(value: string): boolean {
  return ESPN_LEAGUE_ID_PATTERN.test(String(value ?? '').trim())
}

export function isValidSeasonYear(value: number): boolean {
  return (
    Number.isInteger(value) && value >= MIN_SEASON_YEAR && value <= MAX_SEASON_YEAR
  )
}

/**
 * Clean a pasted cookie value.
 *
 * DevTools shows the SWID value wrapped in double quotes (`"f8e2…"`), and
 * commissioners routinely copy the whole `name=value` pair. Both are stripped
 * here so the stored value is the bare token ESPN expects in its `Cookie`
 * header — the adapter sends `espn_s2=<value>; SWID=<value>` verbatim.
 */
export function normalizeCookieValue(
  value: string | null | undefined,
  name: 'espn_s2' | 'SWID',
): string {
  let out = String(value ?? '').trim()
  // Drop a leading "name=" if the whole pair was pasted (case-insensitive,
  // and tolerant of the `swid` / `SWID` spelling both ways).
  const pair = new RegExp(`^${name}\\s*=\\s*`, 'i')
  if (pair.test(out)) out = out.replace(pair, '')
  // Strip one layer of matching quotes.
  if (
    out.length >= 2 &&
    ((out.startsWith('"') && out.endsWith('"')) ||
      (out.startsWith("'") && out.endsWith("'")))
  ) {
    out = out.slice(1, -1).trim()
  }
  return out
}

/**
 * A private ESPN league needs both cookies; one alone still 401s. Returns the
 * pair when both are present after normalisation, otherwise null (public
 * league path) and an error naming what is missing.
 */
export function resolveCookies(
  input: ESPNCookieInput,
): { cookies: ESPNNormalizedCookies | null; error?: string } {
  const espnS2 = normalizeCookieValue(input.espnS2, 'espn_s2')
  const swid = normalizeCookieValue(input.swid, 'SWID')

  if (!espnS2 && !swid) return { cookies: null }
  if (!espnS2) {
    return {
      cookies: null,
      error: 'Private leagues need both cookies — the espn_s2 value is missing.',
    }
  }
  if (!swid) {
    return {
      cookies: null,
      error: 'Private leagues need both cookies — the SWID value is missing.',
    }
  }
  return { cookies: { espnS2, swid } }
}

/**
 * One-line copy per failure mode, mirroring `describeSleeperError`.
 *
 * The auth branch is wording-sensitive: ESPN returns 401 both when cookies
 * were never sent (league is private) and when the sent ones are stale, so we
 * key the message off whether cookies were in play.
 */
export function describeESPNError(err: unknown, hadCookies = false): string {
  if (err instanceof ESPNAuthRequiredError) {
    return hadCookies
      ? 'ESPN rejected those cookies — they have likely expired. Sign in to ESPN again and copy fresh espn_s2 and SWID values.'
      : 'That league is private on ESPN. Add your espn_s2 and SWID cookies to connect it.'
  }
  if (err instanceof ESPNNotFoundError) {
    return 'League not found on ESPN. Check the league ID from your league URL and that the season year is right.'
  }
  if (err instanceof ESPNRateLimitError) {
    return 'ESPN is rate-limiting requests right now. Try again in a minute.'
  }
  if (err instanceof ESPNNetworkError) {
    return 'Could not reach the ESPN API. Check your connection and try again.'
  }
  if (err instanceof ESPNApiError) {
    return `ESPN API error (${err.statusCode}). Try again shortly.`
  }
  return 'Could not load the league details from ESPN.'
}

function classify(err: unknown): ESPNErrorKind {
  if (err instanceof ESPNAuthRequiredError) return 'auth'
  if (err instanceof ESPNNotFoundError) return 'notfound'
  if (err instanceof ESPNRateLimitError) return 'ratelimit'
  if (err instanceof ESPNNetworkError) return 'network'
  return 'api'
}

function toLeagueView(league: ESPNLeague): ESPNLeagueView {
  return {
    name: league.name,
    teamCount: league.teamCount,
    scoringPeriodId: league.scoringPeriodId,
    seasonYear: league.seasonYear,
    isPublic: league.isPublic,
  }
}

/**
 * Call ESPN for one league and report whether it is reachable with these
 * credentials. Used by `connectESPN` before any DB write, and by
 * `updateESPNCookies` to refuse storing cookies ESPN will not accept.
 *
 * `seasonYearOverride` lets a caller (the connect flow) probe a season the
 * connection row does not carry yet.
 */
export async function verifyESPNLeague(
  externalLeagueId: string,
  seasonYear: number,
  cookies?: ESPNNormalizedCookies | null,
): Promise<VerifyESPNResult> {
  const id = String(externalLeagueId ?? '').trim()
  if (!isESPNLeagueId(id)) {
    return {
      ok: false,
      error:
        'Invalid ESPN league ID — enter only the number from your league URL, like 1241838.',
      kind: 'invalid',
      needsCookies: false,
    }
  }
  if (!isValidSeasonYear(seasonYear)) {
    return {
      ok: false,
      error: `Invalid season year — enter a year between ${MIN_SEASON_YEAR} and ${MAX_SEASON_YEAR}.`,
      kind: 'invalid',
      needsCookies: false,
    }
  }

  const adapter = new ESPNAdapter(cookies ? { ...cookies } : {})
  try {
    const league = await adapter.getLeague(Number(id), seasonYear)
    return { ok: true, league: toLeagueView(league) }
  } catch (err) {
    return {
      ok: false,
      error: describeESPNError(err, cookies != null),
      kind: classify(err),
      // ESPN asked for auth and we either sent nothing or sent something it
      // refused. Either way the UI should be showing the cookie fields.
      needsCookies: err instanceof ESPNAuthRequiredError,
    }
  }
}

export type ESPNSnapshotResult =
  | { ok: true; snapshot: ESPNLeagueView; authRequired: false }
  | { ok: false; reason: string; authRequired: boolean }

/**
 * Best-effort live details for display. Never throws — a page that cannot
 * reach ESPN degrades to the raw league ID plus a reason, exactly like
 * `fetchSleeperSnapshot`.
 */
export async function fetchESPNSnapshot(
  externalLeagueId: string,
  seasonYear: number | null | undefined,
  cookies?: ESPNNormalizedCookies | null,
): Promise<ESPNSnapshotResult> {
  const year = seasonYear ?? new Date().getFullYear()
  const result = await verifyESPNLeague(externalLeagueId, year, cookies)
  if (result.ok) {
    return { ok: true, snapshot: result.league, authRequired: false }
  }
  return { ok: false, reason: result.error, authRequired: result.kind === 'auth' }
}

/**
 * Live details for a stored ESPN connection, cookies included.
 *
 * This is the only reader allowed to look at `espn_s2` / `swid`, and it keeps
 * them local: the return type has no cookie fields. Callers (server pages)
 * pass a connection id, never a secret.
 */
export async function fetchESPNConnectionSnapshot(
  connectionId: string,
): Promise<
  | (ESPNSnapshotResult & { connection: IntegrationConnectionRow })
  | null
> {
  const { data, error } = await db
    .from('integration_connections')
    .select(
      'id, league_id, provider, external_league_id, status, last_synced_at, created_by, created_at, espn_s2, swid, season_year',
    )
    .eq('id', connectionId)
    .maybeSingle()

  if (error || !data) {
    console.error('fetchESPNConnectionSnapshot lookup error:', error)
    return null
  }

  const row = data as unknown as IntegrationConnectionRow
  const resolved = resolveCookies({ espnS2: row.espn_s2, swid: row.swid })
  const outcome = await fetchESPNSnapshot(
    row.external_league_id,
    row.season_year,
    resolved.cookies,
  )

  // Cookie columns stop here: the returned `connection` must never carry
  // them into a page's props, however unused they are today.
  const { espn_s2: _s2, swid: _swid, ...safeRow } = row
  return { ...outcome, connection: safeRow as Omit<IntegrationConnectionRow, 'espn_s2' | 'swid'> }
}
