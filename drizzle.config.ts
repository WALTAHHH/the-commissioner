import type { Config } from 'drizzle-kit'

export default {
  schema: ['./src/db/schema.ts', './src/db/schema/permissions.ts', './src/db/schema/leagues.ts', './src/db/schema/members.ts', './src/db/schema/invitations.ts', './src/db/schema/rules.ts', './src/db/schema/integrations.ts', './src/db/schema/finances.ts', './src/db/schema/governance.ts', './src/db/schema/announcements.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config