import { pgSchema, uuid } from 'drizzle-orm/pg-core';

// Supabase's auth schema is managed by GoTrue, never by our migrations.
// This is a minimal mirror used only to express FK targets against auth.users.
export const authSchema = pgSchema('auth');

export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});
