import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
    'Add it in Vercel → Settings → Environment Variables.'
  )
}

// Log the host being used (not the password) to help debug connection issues
const parsed = new URL(url)
console.log('[db] connecting to host:', parsed.hostname, 'port:', parsed.port)

const client = postgres(url, { ssl: 'require' })
export const db = drizzle(client)
