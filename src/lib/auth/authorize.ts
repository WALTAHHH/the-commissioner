/**
 * Authorization service stub.
 *
 * Reads no data yet, so it deliberately imports no DB client: when this grows
 * real checks it should go through the service-role Supabase client in
 * src/lib/db.ts (PostgREST over HTTPS), not a direct Postgres connection, and
 * every query must use raw column names (`league_id`, `user_id`).
 */

export interface AuthorizeParams {
  userId: string
  leagueId: string
  action: string
  resourceId?: string
}

/**
 * Authorization service stub.
 *
 * This is a placeholder implementation that always denies access.
 * In Phase 1, this function will query the permission tables and evaluate
 * the member's roles and overrides for the given league.
 *
 * Key design rules:
 * - Deny by default: unless a rule explicitly grants the permission, return false.
 * - Cross‑league isolation: a user in league A cannot query league B data via ID manipulation.
 *   The `leagueId` parameter must match the league of the resource being accessed.
 *   The caller must ensure the resource belongs to the same league as the `leagueId`.
 */
export async function authorize({
  userId,
  leagueId,
  action,
  resourceId,
}: AuthorizeParams): Promise<boolean> {
  // Stub implementation: deny all requests.
  // This enforces the deny‑by‑default principle.
  return false
}

/**
 * Helper to check if a user is a member of a league.
 * Used internally by the authorization service.
 */
async function isLeagueMember(userId: string, leagueId: string): Promise<boolean> {
  // TODO: query league_members table
  return false
}