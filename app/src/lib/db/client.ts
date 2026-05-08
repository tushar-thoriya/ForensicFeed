import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/lib/env'
import * as schema from './schema'

const env = getEnv()

const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // Required for Supabase pooler (transaction mode)
})

export const db = drizzle(client, { schema })
export { schema }
