import type { Config } from 'drizzle-kit'

export default {
  schema: ['./src/db/schema.ts', './src/db/schema/permissions.ts', './src/db/schema/leagues.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config