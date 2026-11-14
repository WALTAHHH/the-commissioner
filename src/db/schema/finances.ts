import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { leagueMembers } from './members';
import { authUsers } from './auth';

/**
 * League finances — obligations, payments, ledger (recordkeeping only).
 *
 * NO payment processing lives here: `payment_instructions` is plain free text
 * (e.g. "Venmo @commissioner — no integration, no stored handles"). There is
 * deliberately no reference to any external payment provider.
 *
 * Effective status of an obligation is derived from its latest
 * financial_payments row (see app/actions/finances.ts); an obligation with no
 * payment records is implicitly 'pending'.
 */

// Category type values — enforced at the application layer via these
// constants (the column stays plain `text`, matching how `role` / `status`
// columns are handled elsewhere in this schema; no PG enum type so values
// can be extended without a migration).
export const FINANCIAL_CATEGORY_TYPES = [
  'dues',
  'side_bet',
  'penalty',
  'payout',
  'other',
] as const;
export type FinancialCategoryType =
  (typeof FINANCIAL_CATEGORY_TYPES)[number];

// Payment status values (same rationale as above).
export const PAYMENT_STATUSES = ['pending', 'received', 'disputed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Prize axes (same rationale as above — plain text columns, app-layer
// constants). A prize is (scope × type): season/weekly crossed with
// payout/recognition. Weekly prizes carry week_number and no place;
// season payouts carry place; season recognitions carry neither.
export const PRIZE_TYPES = ['payout', 'recognition'] as const;
export type PrizeType = (typeof PRIZE_TYPES)[number];

export const PRIZE_SCOPES = ['season', 'weekly'] as const;
export type PrizeScope = (typeof PRIZE_SCOPES)[number];

export const financialCategories = pgTable(
  'financial_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'dues' | 'side_bet' | 'penalty' | 'payout' | 'other'
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('financial_categories_league_id_idx').on(table.leagueId),
    uniqueIndex('financial_categories_league_name_idx').on(
      table.leagueId,
      table.name,
    ),
  ],
);

export const financialObligations = pgTable(
  'financial_obligations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    memberId: uuid('member_id')
      .references(() => leagueMembers.id)
      .notNull(),
    categoryId: uuid('category_id').references(
      () => financialCategories.id,
    ),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    description: text('description').notNull(),
    dueDate: date('due_date'), // 'YYYY-MM-DD', nullable (no fixed deadline)
    // Free-text only — never parsed, never wired to a payment provider.
    paymentInstructions: text('payment_instructions'),
    createdBy: uuid('created_by')
      .references(() => authUsers.id)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('financial_obligations_league_id_idx').on(table.leagueId),
    index('financial_obligations_member_id_idx').on(table.memberId),
    index('financial_obligations_category_id_idx').on(table.categoryId),
  ],
);

export const financialPayments = pgTable(
  'financial_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    obligationId: uuid('obligation_id')
      .references(() => financialObligations.id)
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    recordedBy: uuid('recorded_by')
      .references(() => authUsers.id)
      .notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    notes: text('notes'),
    status: text('status').notNull().default('pending'), // 'pending' | 'received' | 'disputed'
  },
  (table) => [
    index('financial_payments_obligation_id_idx').on(table.obligationId),
  ],
);

export const prizeStructure = pgTable(
  'prize_structure',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    seasonYear: integer('season_year').notNull(),
    // 1 = champion; NULL for weekly prizes and season recognitions, which
    // have no finishing place.
    place: integer('place'),
    description: text('description').notNull(),
    // Dollars owed on award; NULL for recognition prizes. Payouts are
    // required (amount > 0) in app code, not by a column constraint.
    amount: numeric('amount', { precision: 12, scale: 2 }),
    type: text('type').notNull().default('payout'), // 'payout' | 'recognition'
    scope: text('scope').notNull().default('season'), // 'season' | 'weekly'
    weekNumber: integer('week_number'), // weekly prizes only
    // Winner recorded after the fact by the commissioner; NULL until awarded.
    winnerMemberId: uuid('winner_member_id').references(
      () => leagueMembers.id,
    ),
    awardedAt: timestamp('awarded_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .references(() => authUsers.id)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('prize_structure_league_id_idx').on(table.leagueId),
    // Season reads: WHERE league_id = ? AND season_year = ? ORDER BY scope.
    index('prize_structure_league_season_scope_idx').on(
      table.leagueId,
      table.seasonYear,
      table.scope,
    ),
    // One payout per place per season. Nullable place rows stay unconstrained
    // (Postgres treats NULLs as distinct), so weekly/recognition prizes
    // coexist while old season payouts keep their invariant.
    uniqueIndex('prize_structure_league_season_place_idx').on(
      table.leagueId,
      table.seasonYear,
      table.place,
    ),
  ],
);

export type FinancialCategory = typeof financialCategories.$inferSelect;
export type NewFinancialCategory = typeof financialCategories.$inferInsert;
export type FinancialObligation = typeof financialObligations.$inferSelect;
export type NewFinancialObligation = typeof financialObligations.$inferInsert;
export type FinancialPayment = typeof financialPayments.$inferSelect;
export type NewFinancialPayment = typeof financialPayments.$inferInsert;
export type PrizeStructure = typeof prizeStructure.$inferSelect;
export type NewPrizeStructure = typeof prizeStructure.$inferInsert;
