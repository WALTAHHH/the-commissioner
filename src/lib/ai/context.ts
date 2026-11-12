/**
 * AI Context Builder
 *
 * Constructs the league-specific context that will be provided to AI prompts
 * and tool-calling logic.
 */

/**
 * Represents a user's identity within the system.
 */
export interface UserIdentity {
  userId: string;
  email: string;
  displayName: string;
}

/**
 * Represents a league membership with role and permissions.
 */
export interface LeagueMembership {
  leagueId: string;
  leagueName: string;
  role: 'commissioner' | 'co-commissioner' | 'treasurer' | 'rules-admin' | 'historian' | 'member' | 'guest';
  permissions: string[]; // list of permission strings (e.g., 'league:read')
}

/**
 * League rules summary.
 */
export interface LeagueRules {
  scoring: Record<string, unknown>;
  roster: Record<string, unknown>;
  tradeDeadline?: string;
  playoffSettings?: Record<string, unknown>;
}

/**
 * Financial summary for the league.
 */
export interface FinancialSummary {
  totalDues: number;
  collected: number;
  outstanding: number;
  currency: string;
}

/**
 * Upcoming event (draft, trade deadline, playoff week).
 */
export interface UpcomingEvent {
  id: string;
  name: string;
  date: string;
  description?: string;
}

/**
 * The complete league context for AI agents.
 */
export interface LeagueContext {
  identity: UserIdentity;
  membership: LeagueMembership;
  permissions: string[];
  rules: LeagueRules;
  finances: FinancialSummary;
  upcomingEvents: UpcomingEvent[];
}

/**
 * Stub function to build the league context.
 *
 * TODO: Implement using domain services to fetch real data.
 */
export async function buildLeagueContext(
  userId: string,
  leagueId: string
): Promise<LeagueContext> {
  // This is a placeholder implementation.
  // In the real implementation, this function will:
  // 1. Fetch user identity from auth service
  // 2. Fetch league membership and permissions from membership service
  // 3. Fetch league rules from rules service
  // 4. Fetch financial summary from finance service
  // 5. Fetch upcoming events from events service
  // 6. Assemble into a LeagueContext object

  return {
    identity: {
      userId,
      email: 'user@example.com',
      displayName: 'Example User',
    },
    membership: {
      leagueId,
      leagueName: 'Example League',
      role: 'member',
      permissions: ['league:read', 'membership:read', 'rules:read', 'finance:read', 'history:read'],
    },
    permissions: ['league:read', 'membership:read', 'rules:read', 'finance:read', 'history:read'],
    rules: {
      scoring: {},
      roster: {},
    },
    finances: {
      totalDues: 0,
      collected: 0,
      outstanding: 0,
      currency: 'USD',
    },
    upcomingEvents: [],
  };
}