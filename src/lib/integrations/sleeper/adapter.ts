import {
  normalizeLeague,
  normalizeMembers,
  normalizeRosters,
} from './normalize';
import type {
  RawSleeperLeague,
  RawSleeperUser,
  RawSleeperRoster,
  SleeperLeague,
  SleeperMember,
  SleeperRoster,
} from './types';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const NETWORK_BACKOFF_MS = 500;

/**
 * Base class for every failure the adapter can surface. `statusCode` is the
 * HTTP status (0 for network-level failures/timeouts). Callers that only care
 * "was it a Sleeper failure?" can catch this; finer handling checks subclasses.
 */
export class SleeperApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'SleeperApiError';
  }
}

/** Resource does not exist (HTTP 404, or HTTP 200 with a `null` body). */
export class SleeperNotFoundError extends SleeperApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 404, options);
    this.name = 'SleeperNotFoundError';
  }
}

/** Rate limited after exhausting retries (HTTP 429). */
export class SleeperRateLimitError extends SleeperApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 429, options);
    this.name = 'SleeperRateLimitError';
  }
}

/** Connection failure, DNS/TLS error, timeout, or undecodable response. */
export class SleeperNetworkError extends SleeperApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 0, options);
    this.name = 'SleeperNetworkError';
  }
}

/**
 * Read-only client for the public Sleeper API (https://api.sleeper.app/v1).
 * No authentication — all endpoints used here are public league data.
 *
 * Behavior:
 *  - native `fetch()` only, per-project constraint (no axios/got).
 *  - per-attempt timeout (AbortController), retried up to {@link MAX_ATTEMPTS}.
 *  - HTTP 429 is retried honoring `Retry-After` (seconds) when present.
 *  - 404 (and 200-with-`null`-body, which Sleeper also uses for missing
 *    resources) throws {@link SleeperNotFoundError}.
 *  - network errors / timeouts are retried, then wrapped in
 *    {@link SleeperNetworkError} with the original error as `cause`.
 */
export class SleeperAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: { baseUrl?: string; timeoutMs?: number } = {}) {
    this.baseUrl = options.baseUrl ?? SLEEPER_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch a Sleeper league by its external ID.
   * Throws {@link SleeperNotFoundError} if the league does not exist.
   */
  async getLeague(sleeperLeagueId: string): Promise<SleeperLeague> {
    const raw = await this.requestJson<RawSleeperLeague>(
      `${this.baseUrl}/league/${sleeperLeagueId}`
    );
    return normalizeLeague(sleeperLeagueId, raw);
  }

  /**
   * Fetch all members (users) of a Sleeper league.
   */
  async getMembers(sleeperLeagueId: string): Promise<SleeperMember[]> {
    const raws = await this.requestJson<RawSleeperUser[]>(
      `${this.baseUrl}/league/${sleeperLeagueId}/users`
    );
    return normalizeMembers(raws);
  }

  /**
   * Fetch all rosters of a Sleeper league.
   */
  async getRosters(sleeperLeagueId: string): Promise<SleeperRoster[]> {
    const raws = await this.requestJson<RawSleeperRoster[]>(
      `${this.baseUrl}/league/${sleeperLeagueId}/rosters`
    );
    return normalizeRosters(raws);
  }

  /**
   * GET `url`, parse JSON, with per-attempt timeout and bounded retries.
   * Deterministic API errors (404/4xx/5xx/invalid JSON) are thrown immediately;
   * only transient failures (network, timeout, 429) are retried.
   */
  private async requestJson<T>(url: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Fresh controller+timer per attempt: an aborted signal stays aborted,
      // and a cleared timer can never fire again, so both must be per-attempt.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          let data: unknown;
          try {
            data = await response.json();
          } catch (err) {
            throw new SleeperApiError(
              `Invalid JSON in response from ${url}`,
              response.status,
              { cause: err }
            );
          }
          // Sleeper returns HTTP 200 with a literal `null` body for some
          // missing resources; treat it the same as 404.
          if (data === null || data === undefined) {
            throw new SleeperNotFoundError(`Resource not found: ${url}`);
          }
          return data as T;
        }

        if (response.status === 404) {
          throw new SleeperNotFoundError(`Resource not found: ${url}`);
        }

        if (response.status === 429) {
          lastError = new SleeperRateLimitError(
            `Rate limited by Sleeper API: ${url}`
          );
          if (attempt < MAX_ATTEMPTS) {
            await sleep(this.retryAfterMs(response.headers.get('Retry-After'), attempt));
            continue;
          }
          throw lastError;
        }

        throw new SleeperApiError(
          `Sleeper API error: ${response.status} ${response.statusText} for ${url}`,
          response.status
        );
      } catch (err) {
        // Typed API errors are deterministic — surface immediately.
        if (err instanceof SleeperApiError) {
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

    throw new SleeperNetworkError(
      `Network error calling ${url} after ${MAX_ATTEMPTS} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
      { cause: lastError }
    );
  }

  /**
   * Parse a `Retry-After` header (seconds). Falls back to linear backoff when
   * absent or unparseable. Capped at 30s so a hostile header can't stall a
   * request loop.
   */
  private retryAfterMs(header: string | null, attempt: number): number {
    const seconds = header !== null ? Number.parseInt(header, 10) : NaN;
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
    return 1000 * attempt;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
