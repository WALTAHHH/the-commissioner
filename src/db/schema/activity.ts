import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { authUsers } from './auth';

/**
 * Canonical activity event types. Writes go through `recordActivity()` in
 * src/lib/activity.ts — keep this list and that call-site list in sync when
 * new actions start emitting events.
 *
 * The column is plain TEXT (not a Postgres enum) on purpose: adding a type is
 * a code change, never a migration, and the app never trusts the DB to
 * validate it. `recordActivity` is the only writer the app exposes.
 */
export const ACTIVITY_EVENT_TYPES = [
  // Membership
  'member_joined',
  'member_removed',
  // Placeholder slots (migration 0010)
  'member_placeholder_created',
  'member_placeholder_claimed',
  'member_placeholder_merged',
  // Rules
  'rule_created',
  'rule_updated',
  'rule_deleted',
  // Money (emitted by future obligation/payment actions)
  'obligation_created',
  'payment_recorded',
  // Prizes (emitted by prize definition/award actions)
  'prize_created',
  'prize_awarded',
  // Invitations
  'invitation_created',
  // League lifecycle
  'league_created',
  'league_settings_changed',
  // Integrations
  'integration_connected',
  'integration_synced',
  // Announcements (emitted by announcement actions)
  'announcement_created',
  'announcement_updated',
  'announcement_deleted',
  // Governance
  'poll_created',
  'vote_cast',
  'poll_closed',
  'dispute_raised',
  'dispute_resolved',
  'decision_recorded',
  // History
  'season_record_created',
  'season_record_updated',
  'award_created',
  'season_recap_upserted',
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/**
 * activity_events — append-only audit trail, one row per notable action.
 *
 * Read pattern is always "newest events of one league" (the activity feed
 * page), hence the composite (league_id, created_at) index.
 *
 * actor_id is nullable so system-generated events (a scheduled sync, a
 * webhook) can be recorded without inventing a user; the feed renders a null
 * actor as "System".
 *
 * metadata carries whatever the feed or a future filter might want to show
 * without a second query (ruleId, connectionId, teamName…) — untyped JSON on
 * purpose, validated by the emitting action, not the DB.
 */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    actorId: uuid('actor_id').references(() => authUsers.id),
    eventType: text('event_type').notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('activity_events_league_created_idx').on(
      table.leagueId,
      table.createdAt,
    ),
  ],
);

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
