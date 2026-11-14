import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues';

/**
 * Stores connections to external fantasy platforms (Sleeper, ESPN, etc.)
 * Each connection links a league in our system to an external league.
 */
export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .references(() => leagues.id)
      .notNull(),
    provider: text('provider').notNull(), // 'sleeper', 'espn', etc.
    externalLeagueId: text('external_league_id').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(), // references auth.users.id
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    status: text('status').notNull().default('active'), // 'active' | 'disconnected'
    espnS2: text('espn_s2'), // TODO: encrypt at rest in production
    swid: text('swid'), // TODO: encrypt at rest in production
  },
  (table) => [
    uniqueIndex('integration_connections_league_provider_idx').on(
      table.leagueId,
      table.provider
    ),
    uniqueIndex('integration_connections_external_league_idx').on(
      table.provider,
      table.externalLeagueId
    ),
  ]
);

/**
 * Logs each sync attempt for a connection.
 * Raw snapshot (or key fields) can be stored in `rawSnapshot` as JSONB.
 */
export const integrationSyncLog = pgTable('integration_sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id')
    .references(() => integrationConnections.id)
    .notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull(), // 'success' | 'error'
  errorMessage: text('error_message'),
  rawSnapshot: jsonb('raw_snapshot'), // optional full raw API response
});

// Types inference
export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type NewIntegrationConnection = typeof integrationConnections.$inferInsert;
export type IntegrationSyncLog = typeof integrationSyncLog.$inferSelect;
export type NewIntegrationSyncLog = typeof integrationSyncLog.$inferInsert;