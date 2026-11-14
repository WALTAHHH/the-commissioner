// PLACEHOLDER for ESPN-1a — real adapter will be implemented in parent task.
// This file ensures TypeScript compilation passes for ESPN-1b.

export class ESPNAuthRequiredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ESPNAuthRequiredError';
  }
}

export class ESPNAdapter {
  private cookies?: { espnS2: string; swid: string };

  constructor(cookies?: { espnS2: string; swid: string }) {
    this.cookies = cookies;
  }

  async getLeague(leagueId: string): Promise<unknown> {
    throw new Error('Not implemented');
  }

  async getMembers(leagueId: string): Promise<unknown> {
    throw new Error('Not implemented');
  }

  async getRosters(leagueId: string): Promise<unknown> {
    throw new Error('Not implemented');
  }

  async getCurrentWeekMatchups(leagueId: string): Promise<unknown> {
    throw new Error('Not implemented');
  }
}