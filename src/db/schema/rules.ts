import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth';
import { leagues } from './leagues';

export const ruleCategories = pgTable('rule_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('rule_categories_league_order_idx').on(table.leagueId, table.displayOrder),
]);

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  categoryId: uuid('category_id').references(() => ruleCategories.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  isPublished: boolean('is_published').default(false).notNull(),
  createdBy: uuid('created_by').references(() => authUsers.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('rules_league_id_idx').on(table.leagueId),
  index('rules_category_id_idx').on(table.categoryId),
]);

export const ruleVersions = pgTable('rule_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').references(() => rules.id).notNull(),
  body: text('body').notNull(),
  changedBy: uuid('changed_by').references(() => authUsers.id).notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('rule_versions_rule_id_idx').on(table.ruleId),
]);

export type RuleCategory = typeof ruleCategories.$inferSelect;
export type NewRuleCategory = typeof ruleCategories.$inferInsert;
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
export type RuleVersion = typeof ruleVersions.$inferSelect;
export type NewRuleVersion = typeof ruleVersions.$inferInsert;