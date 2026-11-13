import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Lazy singleton — only connects at request time, not at build time.
// DATABASE_URL is not available during Vercel's build phase.
let _db: ReturnType<typeof drizzle> | null = null

function getDb() {
  if (_db) return _db

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')

  const parsed = new URL(url)
  console.log('[db] connecting to', parsed.hostname, 'as', parsed.username)

  const client = postgres({
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432'),
    database: parsed.pathname.replace(/^\//, ''),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl: 'require',
    max: 1,
  })

  _db = drizzle(client)
  return _db
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return (getDb() as any)[prop]
  },
})
