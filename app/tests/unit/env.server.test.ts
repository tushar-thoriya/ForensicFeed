// @vitest-environment node
import { describe, expect, it } from 'vitest'

describe('env (server)', () => {
  it('parses server-only schema and caches the result', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/test'
    process.env.INGESTION_SEED_MONTHS = '6'
    const { getEnv } = await import('@/lib/env')
    const env = getEnv()
    expect(env.NODE_ENV).toBeDefined()
    expect(env.INGESTION_SEED_MONTHS).toBe(6)
    expect(env.DATABASE_URL).toContain('postgres')
    const envAgain = getEnv()
    expect(envAgain).toBe(env)
  })
})
