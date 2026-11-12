import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Supabase transaction pooler — IPv4 compatible, works on Vercel serverless
// Uses explicit connection params to avoid URL parsing issues with
// dotted usernames (postgres.ylqmmfzyicrcuripuejj)
const url = process.env.DATABASE_URL

if (!url) {
  throw new Error('DATABASE_URL is not set in environment variables.')
}

// postgres-js has trouble parsing postgresql://user.ref@host style URLs.
// Pass connection params explicitly to bypass URL parsing.
let client: ReturnType<typeof postgres>

try {
  const parsed = new URL(url)
  client = postgres({
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432'),
    database: parsed.pathname.replace(/^\//, ''),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl: 'require',
    max: 1, // serverless: use minimal connections
  })
  console.log('[db] host:', parsed.hostname, 'user:', parsed.username)
} catch (e) {
  throw new Error(`Failed to parse DATABASE_URL: ${e}`)
}

export const db = drizzle(client)
