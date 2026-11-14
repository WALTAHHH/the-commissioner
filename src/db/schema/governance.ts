import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { leagueMembers } from './members';
import { authUsers } from './auth';

// Poll type values
export const POLL_TYPES = ['informal', 'binding'] as const;
export type PollType = (typeof POLL_TYPES)[number];

// Poll status values
export const POLL_STATUSES = ['open', 'closed', 'cancelled'] as const;
export type PollStatus = (typeof POLL_STATUSES)[number];

// Threshold type values
export const POLL_THRESHOLDS = ['majority', 'supermajority', 'unanimous', 'custom'] as const;
export type PollThreshold = (typeof POLL_THRESHOLDS)[number];

// Dispute status values
export const DISPUTE_STATUSES = ['open', 'resolved'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const polls = pgTable(
  'polls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    createdBy: uuid('created_by')
      .references(() => authUsers.id)
      .notNull(),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull(), // 'informal' | 'binding'
    status: text('status').notNull().default('open'), // 'open' | 'closed' | 'cancelled'
    threshold: text('threshold').notNull(), // 'majority' | 'supermajority' | 'unanimous' | 'custom'
    customThreshold: integer('custom_threshold'), // nullable, used when threshold = 'custom'
    votingWindowHours: integer('voting_window_hours').default(72).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('polls_league_id_idx').on(table.leagueId),
    index('polls_created_by_idx').on(table.createdBy),
    index('polls_status_idx').on(table.status),
  ],
);

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .references(() => polls.id)
      .notNull(),
    text: text('text').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [
    index('poll_options_poll_id_idx').on(table.pollId),
    index('poll_options_display_order_idx').on(table.displayOrder),
  ],
);

export const pollVotes = pgTable(
  'poll_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .references(() => polls.id)
      .notNull(),
    optionId: uuid('option_id')
      .references(() => pollOptions.id)
      .notNull(),
    memberId: uuid('member_id')
      .references(() => leagueMembers.id)
      .notNull(),
    castAt: timestamp('cast_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('poll_votes_poll_member_idx').on(table.pollId, table.memberId),
    index('poll_votes_option_id_idx').on(table.optionId),
  ],
);

export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    pollId: uuid('poll_id').references(() => polls.id),
    title: text('title').notNull(),
    description: text('description').notNull(),
    outcome: text('outcome').notNull(),
    recordedBy: uuid('recorded_by')
      .references(() => authUsers.id)
      .notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('decisions_league_id_idx').on(table.leagueId),
    index('decisions_poll_id_idx').on(table.pollId),
  ],
);

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    raisedBy: uuid('raised_by')
      .references(() => leagueMembers.id)
      .notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('open'), // 'open' | 'resolved'
    resolution: text('resolution'),
    resolvedBy: uuid('resolved_by').references(() => authUsers.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('disputes_league_id_idx').on(table.leagueId),
    index('disputes_status_idx').on(table.status),
  ],
);

export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type PollOption = typeof pollOptions.$inferSelect;
export type NewPollOption = typeof pollOptions.$inferInsert;
export type PollVote = typeof pollVotes.$inferSelect;
export type NewPollVote = typeof pollVotes.$inferInsert;
export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;