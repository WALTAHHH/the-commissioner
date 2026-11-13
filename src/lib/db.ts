import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// postgres-js accepts a connection string directly — no manual URL parsing needed.
// The lazy singleton prevents connection attempts at build time.
let _client: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle> | null = null

function getDb() {
  if (_db) return _db

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')

  // Pass directly to postgres-js — it handles URL parsing natively
  _client = postgres(url, { ssl: 'require', max: 1 })
  _db = drizzle(_client)
  return _db
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return (getDb() as any)[prop]
  },
})
