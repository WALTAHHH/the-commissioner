import { pgSchema, uuid, text, jsonb } from 'drizzle-orm/pg-core';

// Supabase's auth schema is managed by GoTrue, never by our migrations.
// This is a minimal mirror used to express FK targets against auth.users
// and to read identity fields (email / metadata) for display joins.
// Keep this list to columns that exist natively in auth.users — drizzle-kit
// must never emit DDL for this schema (see rls + migration review notes).
export const authSchema = pgSchema('auth');

export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
  // Nullable in GoTrue (users can sign up with phone).
  email: text('email'),
  // GoTrue user metadata bag; we read `full_name` / `name` when present.
  rawUserMetaData: jsonb('raw_user_meta_data'),
});
