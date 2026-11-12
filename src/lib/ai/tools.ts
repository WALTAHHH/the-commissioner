/**
 * AI Tool Registry
 *
 * Type definitions for the tools exposed to AI agents.
 * Each tool includes metadata required for authorization, safety, and confirmation.
 */

/**
 * Permissions required to invoke a tool.
 * These correspond to RBAC permissions defined in the permission service.
 */
export type Permission =
  | 'league:read'
  | 'league:write'
  | 'membership:read'
  | 'membership:write'
  | 'rules:read'
  | 'rules:write'
  | 'finance:read'
  | 'finance:write'
  | 'communications:write'
  | 'history:read';

/**
 * Metadata common to all AI tools.
 */
export interface ToolDefinition {
  /** Unique identifier for the tool (matches the function name) */
  name: string;
  /** Human-readable description for AI prompt generation */
  description: string;
  /** Permission required to invoke this tool */
  permissionRequired: Permission;
  /** Whether executing this tool requires explicit user confirmation */
  requiresConfirmation: boolean;
  /** Whether the tool is idempotent (safe to retry) */
  idempotent: boolean;
}

// ----------------------------------------------------------------------
// Read-only tools
// ----------------------------------------------------------------------

/**
 * Retrieves a summary of the league: name, commissioner, member count, season status.
 */
export interface GetLeagueSummaryTool extends ToolDefinition {
  name: 'get_league_summary';
  description: 'Get a high-level summary of the league (name, commissioner, member count, season status).';
  permissionRequired: 'league:read';
  requiresConfirmation: false;
  idempotent: true;
}

/**
 * Retrieves the league's rules (scoring, roster, trade deadlines, etc.).
 */
export interface GetLeagueRulesTool extends ToolDefinition {
  name: 'get_league_rules';
  description: 'Get the league rules (scoring, roster, trade deadlines, etc.).';
  permissionRequired: 'rules:read';
  requiresConfirmation: false;
  idempotent: true;
}

/**
 * Retrieves the directory of league members with their roles and contact info.
 */
export interface GetMemberDirectoryTool extends ToolDefinition {
  name: 'get_member_directory';
  description: 'Get the directory of league members with their roles and contact info.';
  permissionRequired: 'membership:read';
  requiresConfirmation: false;
  idempotent: true;
}

/**
 * Retrieves a financial summary (total dues, collected, outstanding obligations).
 */
export interface GetFinancialSummaryTool extends ToolDefinition {
  name: 'get_financial_summary';
  description: 'Get a financial summary (total dues, collected, outstanding obligations).';
  permissionRequired: 'finance:read';
  requiresConfirmation: false;
  idempotent: true;
}

/**
 * Retrieves outstanding financial obligations (who owes what).
 */
export interface GetOutstandingObligationsTool extends ToolDefinition {
  name: 'get_outstanding_obligations';
  description: 'Get outstanding financial obligations (who owes what).';
  permissionRequired: 'finance:read';
  requiresConfirmation: false;
  idempotent: true;
}

/**
 * Retrieves recent activity history (transactions, announcements, rule changes).
 */
export interface GetActivityHistoryTool extends ToolDefinition {
  name: 'get_activity_history';
  description: 'Get recent activity history (transactions, announcements, rule changes).';
  permissionRequired: 'history:read';
  requiresConfirmation: false;
  idempotent: true;
}

// ----------------------------------------------------------------------
// Write tools (interfaces only – no implementation yet)
// ----------------------------------------------------------------------

/**
 * Creates a league-wide announcement.
 */
export interface CreateAnnouncementTool extends ToolDefinition {
  name: 'create_announcement';
  description: 'Create a league-wide announcement.';
  permissionRequired: 'communications:write';
  requiresConfirmation: true;
  idempotent: false;
}

/**
 * Creates a poll for league members to vote on.
 */
export interface CreatePollTool extends ToolDefinition {
  name: 'create_poll';
  description: 'Create a poll for league members to vote on.';
  permissionRequired: 'communications:write';
  requiresConfirmation: true;
  idempotent: false;
}

/**
 * Creates a financial obligation (e.g., dues, fines) for a member or the whole league.
 */
export interface CreateFinancialObligationTool extends ToolDefinition {
  name: 'create_financial_obligation';
  description: 'Create a financial obligation (e.g., dues, fines) for a member or the whole league.';
  permissionRequired: 'finance:write';
  requiresConfirmation: true;
  idempotent: false;
}

// ----------------------------------------------------------------------
// Registry export
// ----------------------------------------------------------------------

/**
 * Array of all defined tools for easy iteration and validation.
 */
export const toolRegistry: ToolDefinition[] = [
  { name: 'get_league_summary', description: 'Get a high-level summary of the league (name, commissioner, member count, season status).', permissionRequired: 'league:read', requiresConfirmation: false, idempotent: true },
  { name: 'get_league_rules', description: 'Get the league rules (scoring, roster, trade deadlines, etc.).', permissionRequired: 'rules:read', requiresConfirmation: false, idempotent: true },
  { name: 'get_member_directory', description: 'Get the directory of league members with their roles and contact info.', permissionRequired: 'membership:read', requiresConfirmation: false, idempotent: true },
  { name: 'get_financial_summary', description: 'Get a financial summary (total dues, collected, outstanding obligations).', permissionRequired: 'finance:read', requiresConfirmation: false, idempotent: true },
  { name: 'get_outstanding_obligations', description: 'Get outstanding financial obligations (who owes what).', permissionRequired: 'finance:read', requiresConfirmation: false, idempotent: true },
  { name: 'get_activity_history', description: 'Get recent activity history (transactions, announcements, rule changes).', permissionRequired: 'history:read', requiresConfirmation: false, idempotent: true },
  { name: 'create_announcement', description: 'Create a league-wide announcement.', permissionRequired: 'communications:write', requiresConfirmation: true, idempotent: false },
  { name: 'create_poll', description: 'Create a poll for league members to vote on.', permissionRequired: 'communications:write', requiresConfirmation: true, idempotent: false },
  { name: 'create_financial_obligation', description: 'Create a financial obligation (e.g., dues, fines) for a member or the whole league.', permissionRequired: 'finance:write', requiresConfirmation: true, idempotent: false },
];