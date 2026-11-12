import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { authUsers } from './auth';

// Membership roles (Phase 1 fixed set — custom roles land with Phase 2
// in the `roles` / `member_roles` tables; this column is the simple
// primary role used for directory display and basic gating).
export const MEMBER_ROLES = [
  'commissioner',
  'co_commissioner',
  'treasurer',
  'member',
  'guest',
] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

// Membership lifecycle. `removed` replaces the old `left_at` timestamp
// stub from Phase 0/B (status is now first-class; re-activation flips a
// removed row back to `active` rather than inserting a duplicate).
export const MEMBER_STATUSES = ['active', 'inactive', 'removed'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * league_members — canonical definition.
 *
 * Replaces the Phase 0/B stub that lived in ./permissions.ts:
 *   * user_id now references auth.users (was the public.users mirror),
 *     consistent with leagues.commissioner_id.
 *   * `role`, `team_name`, `status` added; `left_at` dropped
 *     (derived into `status`).
 */
export const leagueMembers = pgTable(
  'league_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    userId: uuid('user_id')
      .references(() => authUsers.id)
      .notNull(),
    role: text('role').notNull().default('member'),
    teamName: text('team_name'),
    status: text('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('league_members_league_user_idx').on(
      table.leagueId,
      table.userId,
    ),
    index('league_members_user_idx').on(table.userId),
    // Directory query: active members of one league, newest first.
    index('league_members_league_status_idx').on(table.leagueId, table.status),
  ],
);

export type LeagueMember = typeof leagueMembers.$inferSelect;
export type NewLeagueMember = typeof leagueMembers.$inferInsert;
