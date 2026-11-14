import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authUsers } from './auth';
import { leagues } from './leagues';
import { leagueMembers } from './members';

/**
 * Shareable invitation links (Phase 1 / T3).
 *
 * A row is the whole capability: whoever holds `token` can join `league_id`
 * while the row is redeemable. Validity is derived, never stored:
 *   revoked_at IS NULL  AND  expires_at > now()  AND  (max_uses IS NULL OR use_count < max_uses)
 *
 * `token` is opaque and unguessable (crypto.randomUUID()); it is the secret, so
 * the RLS SELECT policy only exposes rows that are still redeemable.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    token: text('token').notNull(),
    // Mirror of Supabase's auth.users (see ./auth.ts). The mirror declares no
    // DDL of its own, but drizzle-kit emits this FK reference to auth.users
    // fine — same pattern as leagues.commissioner_id.
    createdBy: uuid('created_by').references(() => authUsers.id).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`(now() + interval '7 days')`),
    // null = unlimited redemptions
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    // Placeholder slot (0010): when set, redeeming this link claims/merges
    // that specific league_members slot for the joining user — see
    // app/actions/invitations.ts redeemInvitation + src/lib/placeholder.ts.
    placeholderMemberId: uuid('placeholder_member_id').references(
      () => leagueMembers.id,
    ),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('invitations_token_idx').on(table.token),
    index('invitations_league_idx').on(table.leagueId),
  ]
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
