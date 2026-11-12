import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  rawAppMetaData: text('raw_app_meta_data'),
  rawUserMetaData: text('raw_user_meta_data'),
  isSuperAdmin: boolean('is_super_admin').default(false),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert