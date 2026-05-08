import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })

  it('exposes a public app url default in env', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/test'
    const { getEnv } = await import('@/lib/env')
    const env = getEnv()
    expect(env.NEXT_PUBLIC_APP_URL).toMatch(/^https?:\/\//)
  })
})
