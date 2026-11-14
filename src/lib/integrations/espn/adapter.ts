/**
 * Read-only client for the ESPN Fantasy Football API
 * (`lm-api-reads.fantasy.espn.com/apis/v3/games/ffl`).
 *
 * Supports public leagues (no auth) and private leagues via the `espn_s2` +
 * `SWID` session cookies sent as a `Cookie` header. There is no official
 * documentation; shapes were verified live against public league 1241838 /
 * season 2024 (2026-11-14) and against the community reference
 * https://github.com/pseudo-r/Public-ESPN-Fantasy-API
 */
import {
  normalizeDraft,
  normalizeLeague,
  normalizeMatchups,
  normalizeMembers,
  normalizeRosters,
} from './normalize';
import type {
  ESPNDraft,
  ESPNLeague,
  ESPNMatchup,
  ESPNMember,
  ESPNRoster,
  RawESPNLeaguePayload,
} from './types';

const ESPN_BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const NETWORK_BACKOFF_MS = 500;
const MAX_RETRY_AFTER_MS = 30_000;
// ESPN serves HTML to non-browser clients on some hosts; a UA keeps the
// JSON host happy and matches what the community docs recommend.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Base class for every failure the adapter can surface. `statusCode` is the
 * HTTP status (0 for network-level failures/timeouts). Callers that only
 * care "was it an ESPN failure?" can catch this; finer handling checks
 * subclasses.
 */
export class ESPNApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'ESPNApiError';
  }
}

/**
 * The league is private (or the session expired) — the request needs valid
 * `espn_s2` + `SWID` cookies. HTTP 401, or 403 when no cookies were sent.
 */
export class ESPNAuthRequiredError extends ESPNApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 401, options);
    this.name = 'ESPNAuthRequiredError';
  }
}

/** League / season / endpoint does not exist (HTTP 404). */
export class ESPNNotFoundError extends ESPNApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 404, options);
    this.name = 'ESPNNotFoundError';
  }
}

/** Rate limited after exhausting retries (HTTP 429). */
export class ESPNRateLimitError extends ESPNApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 429, options);
    this.name = 'ESPNRateLimitError';
  }
}

/** Connection failure, DNS/TLS error, timeout, or undecodable response. */
export class ESPNNetworkError extends ESPNApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 0, options);
    this.name = 'ESPNNetworkError';
  }
}

export interface ESPNAdapterOptions {
  /** `espn_s2` cookie value — required for private leagues. */
  espnS2?: string;
  /** `SWID` cookie value (usually `{UUID}` form) — required for private leagues. */
  swid?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Pure status → error mapping, exported so the hierarchy can be verified
 * without reaching the network (ESPN 401s can't be simulated against public
 * leagues).
 */
export function errorForStatus(
  status: number,
  url: string,
  hasCookies: boolean,
  statusText = ''
): ESPNApiError {
  if (status === 401) {
    return new ESPNAuthRequiredError(
      hasCookies
        ? `ESPN rejected the provided cookies (expired or invalid espn_s2/SWID) for ${url}`
        : `Private ESPN league — espn_s2 and SWID cookies are required for ${url}`
    );
  }
  if (status === 403 && !hasCookies) {
    return new ESPNAuthRequiredError(
      `Private ESPN league — espn_s2 and SWID cookies are required for ${url}`
    );
  }
  if (status === 404) {
    return new ESPNNotFoundError(`ESPN resource not found: ${url}`);
  }
  if (status === 429) {
    return new ESPNRateLimitError(`Rate limited by ESPN API: ${url}`);
  }
  return new ESPNApiError(
    `ESPN API error: ${status} ${statusText} for ${url}`.trim(),
    status
  );
}

/**
 * Behavior (mirrors the Sleeper adapter):
 *  - native `fetch()` only — no HTTP libs.
 *  - per-attempt timeout (AbortController), retried up to MAX_ATTEMPTS.
 *  - HTTP 429 retried honoring `Retry-After` (capped at 30s), then
 *    {@link ESPNRateLimitError}.
 *  - HTTP 401 (and 403 without cookies) → {@link ESPNAuthRequiredError}.
 *  - HTTP 404 (or 200 with a `null` body) → {@link ESPNNotFoundError}.
 *  - network errors / timeouts retried, then wrapped in
 *    {@link ESPNNetworkError} with the original error as `cause`.
 */
export class ESPNAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly espnS2: string | undefined;
  private readonly swid: string | undefined;

  constructor(options: ESPNAdapterOptions = {}) {
    this.baseUrl = options.baseUrl ?? ESPN_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.espnS2 = options.espnS2 || undefined;
    this.swid = options.swid || undefined;
  }

  /** Whether this instance would send auth cookies. */
  get hasCookies(): boolean {
    return this.espnS2 !== undefined || this.swid !== undefined;
  }

  /**
   * League summary: name, current scoring period, size, scoring format.
   * Throws {@link ESPNAuthRequiredError} for private leagues without cookies,
   * {@link ESPNNotFoundError} for unknown leagues.
   */
  async getLeague(leagueId: number, seasonYear: number): Promise<ESPNLeague> {
    const payload = await this.getLeaguePayload(leagueId, seasonYear, {
      views: ['mTeam', 'mSettings'],
    });
    return normalizeLeague(payload, seasonYear);
  }

  /**
   * League members paired with their teams (owner⇄team rows derived from
   * `teams[].owners`; see normalizeMembers).
   */
  async getMembers(leagueId: number, seasonYear: number): Promise<ESPNMember[]> {
    const payload = await this.getLeaguePayload(leagueId, seasonYear, {
      views: ['mTeam', 'mSettings'],
    });
    return normalizeMembers(payload);
  }

  /**
   * Current rosters for every team, with player names and decoded positions.
   */
  async getRosters(leagueId: number, seasonYear: number): Promise<ESPNRoster[]> {
    const payload = await this.getLeaguePayload(leagueId, seasonYear, {
      views: ['mTeam', 'mRoster'],
    });
    return normalizeRosters(payload);
  }

  /**
   * All games for the season (one row per team pairing per matchup period).
   * `scoringPeriodId` filters to one week — in ESPN FFL, weekly leagues make
   * `matchupPeriodId === scoringPeriodId`, so the filter is applied against
   * `matchupPeriodId`.
   */
  async getMatchups(
    leagueId: number,
    seasonYear: number,
    scoringPeriodId?: number
  ): Promise<ESPNMatchup[]> {
    const payload = await this.getLeaguePayload(leagueId, seasonYear, {
      views: ['mMatchup'],
    });
    return normalizeMatchups(payload, scoringPeriodId);
  }

  /**
   * Draft board / results. Requests rosters alongside so player names can be
   * resolved from the current league data when ESPN omits them from picks
   * (the 2024 FFL format does). Unresolvable names stay null.
   */
  async getDraft(leagueId: number, seasonYear: number): Promise<ESPNDraft> {
    const payload = await this.getLeaguePayload(leagueId, seasonYear, {
      views: ['mDraftDetail', 'mTeam', 'mRoster'],
    });
    return normalizeDraft(payload);
  }

  /** GET the league endpoint with the requested `view` params, parsed. */
  private async getLeaguePayload(
    leagueId: number,
    seasonYear: number,
    options: { views: string[]; params?: Record<string, string | number> }
  ): Promise<RawESPNLeaguePayload> {
    const search = new URLSearchParams();
    for (const view of options.views) search.append('view', view);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      search.set(key, String(value));
    }

    const url = `${this.baseUrl}/seasons/${seasonYear}/segments/0/leagues/${leagueId}?${search.toString()}`;
    return this.requestJson<RawESPNLeaguePayload>(url);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': BROWSER_UA,
    };
    if (this.hasCookies) {
      const cookies: string[] = [];
      if (this.espnS2) cookies.push(`espn_s2=${this.espnS2}`);
      if (this.swid) cookies.push(`SWID=${this.swid}`);
      headers.Cookie = cookies.join('; ');
    }
    return headers;
  }

  /**
   * GET `url`, parse JSON, with per-attempt timeout and bounded retries.
   * Deterministic API errors (401/403/404/4xx/5xx) are thrown immediately;
   * only transient failures (network, timeout, 429) are retried.
   */
  private async requestJson<T>(url: string): Promise<T> {
    const headers = this.headers();
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Fresh controller+timer per attempt: an aborted signal stays aborted,
      // and a cleared timer can never fire again, so both must be per-attempt.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, { headers, signal: controller.signal });

        if (response.ok) {
          let data: unknown;
          try {
            data = await response.json();
          } catch (err) {
            throw new ESPNApiError(
              `Invalid JSON in response from ${url} (HTML response means the API host changed — see community docs)`,
              response.status,
              { cause: err }
            );
          }
          if (data === null || data === undefined) {
            throw new ESPNNotFoundError(`Resource not found: ${url}`);
          }
          return data as T;
        }

        if (response.status === 429) {
          lastError = errorForStatus(429, url, this.hasCookies, response.statusText);
          if (attempt < MAX_ATTEMPTS) {
            await sleep(retryAfterMs(response.headers.get('Retry-After'), attempt));
            continue;
          }
          throw lastError;
        }

        throw errorForStatus(response.status, url, this.hasCookies, response.statusText);
      } catch (err) {
        // Typed API errors are deterministic — surface immediately.
        if (err instanceof ESPNApiError) {
          throw err;
        }
        // Otherwise: network failure / abort-timeout. Retry with backoff.
        lastError = err;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(NETWORK_BACKOFF_MS * attempt);
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw new ESPNNetworkError(
      `Network error calling ${url} after ${MAX_ATTEMPTS} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
      { cause: lastError }
    );
  }
}

/**
 * Parse a `Retry-After` header (seconds). Falls back to linear backoff when
 * absent or unparseable. Capped at 30s so a hostile header can't stall a
 * request loop.
 */
function retryAfterMs(header: string | null, attempt: number): number {
  const seconds = header !== null ? Number.parseInt(header, 10) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return 1000 * attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
