/**
 * Server-side Supabase client — the only DB entry point at runtime.
 *
 * ## Why this replaced Drizzle + postgres-js
 * The Supabase free-tier database host (`db.<project>.supabase.co`) resolves
 * only to IPv6 (AAAA) records, and Vercel's serverless runtime has no IPv6
 * egress, so every raw TCP connection failed in production. Queries now go over
 * HTTPS to PostgREST (`/rest/v1`), which works from any network. The Drizzle
 * schema in `src/db/schema/` is still the source of truth for *migrations*;
 * it is no longer imported by runtime code.
 *
 * ## Two things callers must remember
 * 1. **Column names are the raw database names** — `commissioner_id`,
 *    `league_id`, `created_at`. PostgREST has no ORM layer to translate the
 *    camelCase properties the Drizzle schema declares, so `select('created_at')`
 *    is right and `select('createdAt')` fails with SQLSTATE 42703. Row shapes
 *    live in `src/db/rows.ts`; map to camelCase at the boundary so page/action
 *    contracts stay stable.
 * 2. **The service-role key bypasses RLS.** Every authorisation decision is
 *    therefore made in application code — see `app/actions/*`, which each check
 *    `leagues.commissioner_id` (the source of truth) before writing. Never
 *    export this client to a client component.
 *
 * ## Why lazy
 * `createClient` reads env immediately, and a module-scope throw during
 * `next build` kills page collection (we hit exactly this with DATABASE_URL in
 * ca2c53e). The two Supabase vars are present in every real environment, but
 * building the client on first use costs nothing and keeps the build immune to
 * an env var that is injected only at runtime.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

/**
 * The service-role client, created once per serverless container.
 * Throws only when a query is actually attempted without configuration.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')
  }

  adminClient = createClient(url, serviceRoleKey, {
    // No session to keep on the server: we authenticate with the service role,
    // and the user for each request comes from @supabase/ssr (see
    // src/utils/supabase/server.ts), which is deliberately left alone.
    auth: { persistSession: false, autoRefreshToken: false },
    // Tag our own traffic so the Supabase dashboard logs are attributable.
    global: { headers: { 'x-client-info': 'the-commissioner-server-action' } },
  })

  return adminClient
}

/**
 * Drop-in module-level handle: `db.from('leagues')...` reads the same as the
 * old Drizzle export while deferring construction until the first access.
 * Methods are bound to the real client so nothing depends on Proxy `this`.
 */
export const db: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const value = Reflect.get(getSupabaseAdmin(), property)
    return typeof value === 'function' ? value.bind(getSupabaseAdmin()) : value
  },
})
