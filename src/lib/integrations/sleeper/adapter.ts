import {
  normalizeLeague,
  normalizeMembers,
  normalizeRosters,
} from './normalize';
import type {
  RawSleeperLeague,
  RawSleeperUser,
  RawSleeperRoster,
  NormalizedLeague,
  NormalizedMember,
  NormalizedRoster,
} from './types';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';
const DEFAULT_TIMEOUT_MS = 10000;

export class SleeperAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: { baseUrl?: string; timeoutMs?: number } = {}) {
    this.baseUrl = options.baseUrl ?? SLEEPER_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch a Sleeper league by its external ID.
   * Returns normalized league data.
   * Throws SleeperApiError on network error, 404, or invalid response.
   */
  async getLeague(sleeperLeagueId: string): Promise<NormalizedLeague> {
    const raw = await this.fetch<RawSleeperLeague>(
      `${this.baseUrl}/league/${sleeperLeagueId}`
    );
    return normalizeLeague(sleeperLeagueId, raw);
  }

  /**
   * Fetch all members (users) of a Sleeper league.
   */
  async getMembers(sleeperLeagueId: string): Promise<NormalizedMember[]> {
    const raws = await this.fetch<RawSleeperUser[]>(
      `${this.baseUrl}/league/${sleeperLeagueId}/users`
    );
    return normalizeMembers(raws);
  }

  /**
   * Fetch all rosters of a Sleeper league.
   */
  async getRosters(sleeperLeagueId: string): Promise<NormalizedRoster[]> {
    const raws = await this.fetch<RawSleeperRoster[]>(
      `${this.baseUrl}/league/${sleeperLeagueId}/rosters`
    );
    return normalizeRosters(raws);
  }

  /**
   * Generic fetch wrapper with timeout, retry on 429, and error handling.
   */
  private async fetch<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let lastError: unknown;
    // simple retry for 429 rate limit (max 3 attempts)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          clearTimeout(timeout);
          return data;
        }

        if (response.status === 404) {
          throw new SleeperApiError(`Resource not found: ${url}`, 404);
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * attempt;
          if (attempt < 3) {
            await this.sleep(delay);
            continue;
          }
          throw new SleeperApiError(
            `Rate limit exceeded for ${url} after ${attempt} attempts`,
            429
          );
        }

        throw new SleeperApiError(
          `Sleeper API error: ${response.status} ${response.statusText}`,
          response.status
        );
      } catch (err) {
        lastError = err;
        if (err instanceof SleeperApiError) {
          throw err;
        }
        // network error or abort
        if (attempt === 3) {
          throw new SleeperApiError(
            `Network error after ${attempt} attempts: ${err}`,
            0
          );
        }
        await this.sleep(500 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    // This should never be reached, but TypeScript wants a return.
    throw lastError instanceof Error
      ? lastError
      : new SleeperApiError('Unknown fetch error', 0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class SleeperApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'SleeperApiError';
  }
}