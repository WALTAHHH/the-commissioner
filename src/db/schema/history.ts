import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth';
import { leagues } from './leagues';
import { leagueMembers } from './members';

export const seasonRecords = pgTable('season_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  seasonYear: integer('season_year').notNull(),
  championMemberId: uuid('champion_member_id').references(() => leagueMembers.id),
  championTeamName: text('champion_team_name'),
  runnerUpMemberId: uuid('runner_up_member_id').references(() => leagueMembers.id),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => authUsers.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('season_records_league_year_idx').on(table.leagueId, table.seasonYear),
]);

export const leagueAwards = pgTable('league_awards', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  seasonYear: integer('season_year').notNull(),
  memberId: uuid('member_id').references(() => leagueMembers.id),
  awardName: text('award_name').notNull(),
  description: text('description'),
  createdBy: uuid('created_by').references(() => authUsers.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Optional: index on league+season for grouping
  uniqueIndex('league_awards_league_year_name_idx').on(table.leagueId, table.seasonYear, table.awardName),
]);

export const seasonRecaps = pgTable('season_recaps', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  seasonYear: integer('season_year').notNull(),
  body: text('body').notNull(),
  createdBy: uuid('created_by').references(() => authUsers.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('season_recaps_league_year_idx').on(table.leagueId, table.seasonYear),
]);

// Row types for type safety
export type SeasonRecord = typeof seasonRecords.$inferSelect;
export type NewSeasonRecord = typeof seasonRecords.$inferInsert;
export type LeagueAward = typeof leagueAwards.$inferSelect;
export type NewLeagueAward = typeof leagueAwards.$inferInsert;
export type SeasonRecap = typeof seasonRecaps.$inferSelect;
export type NewSeasonRecap = typeof seasonRecaps.$inferInsert;