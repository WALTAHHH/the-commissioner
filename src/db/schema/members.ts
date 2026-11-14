import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
 *
 * Placeholder slots (migration 0010): a commissioner can reserve a roster
 * row for someone who has no auth account yet. Those rows carry
 * `is_placeholder = true`, a NULL `user_id`, and the `placeholder_*`
 * display fields. When the person signs up, `claimPlaceholder` flips the
 * SAME row to a real membership (user_id set, is_placeholder false,
 * claimed_at stamped) so every obligation / vote / award keyed on this id
 * keeps pointing at the right slot with zero re-parenting.
 *
 * user_id is nullable from 0010 onward. UNIQUE(league_id, user_id) still
 * does its job for real accounts because Postgres treats NULLs as distinct
 * — any number of unclaimed slots may coexist in one league.
 */
export const leagueMembers = pgTable(
  'league_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    // Nullable since 0010: placeholder rows have no auth account.
    userId: uuid('user_id').references(() => authUsers.id),
    role: text('role').notNull().default('member'),
    teamName: text('team_name'),
    status: text('status').notNull().default('active'),
    isPlaceholder: boolean('is_placeholder').notNull().default(false),
    placeholderName: text('placeholder_name'),
    placeholderEmail: text('placeholder_email'),
    placeholderNotes: text('placeholder_notes'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
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
    check(
      'league_members_placeholder_user_id_check',
      sql`is_placeholder = false OR user_id IS NULL`,
    ),
  ],
);

export type LeagueMember = typeof leagueMembers.$inferSelect;
export type NewLeagueMember = typeof leagueMembers.$inferInsert;
