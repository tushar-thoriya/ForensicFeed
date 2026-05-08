import { config as loadEnv } from 'dotenv'
import type { Config } from 'drizzle-kit'

loadEnv({ path: '.env.local' })
loadEnv()

// Prefer the direct (port 5432) connection for migrations — the pooler
// (port 6543, transaction mode) does not support DDL reliably.
const databaseUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL

if (!databaseUrl) {
  // drizzle-kit only — runtime validation lives in src/lib/env.ts
  console.warn(
    '[drizzle.config] DATABASE_URL not set; drizzle-kit commands will fail until configured',
  )
}

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl ?? 'postgres://placeholder',
  },
  verbose: true,
  strict: true,
} satisfies Config
