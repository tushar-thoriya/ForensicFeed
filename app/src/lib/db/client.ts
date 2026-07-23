import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/lib/env'
import * as schema from './schema'

function createDb() {
  const env = getEnv()
  const client = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Required for Supabase pooler (transaction mode)
  })
  return drizzle(client, { schema })
}

let cached: ReturnType<typeof createDb> | null = null

// Lazy singleton. The connection and env read happen on the first query, not
// at import time — so `next build`'s page-data collection can load route
// modules without DATABASE_URL. A real request creates (and caches) the pool.
export function getDb(): ReturnType<typeof createDb> {
  if (!cached) cached = createDb()
  return cached
}

export { schema }
