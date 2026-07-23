import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface HealthResponse {
  status: 'ok' | 'degraded'
  checks: {
    database: { ok: boolean; latencyMs: number | null; error: string | null }
  }
  timestamp: string
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const started = Date.now()
  let dbOk = false
  let dbError: string | null = null
  let latencyMs: number | null = null

  try {
    await getDb().execute(sql`select 1`)
    latencyMs = Date.now() - started
    dbOk = true
  } catch (error: unknown) {
    dbError = error instanceof Error ? error.message : 'unknown database error'
  }

  const body: HealthResponse = {
    status: dbOk ? 'ok' : 'degraded',
    checks: {
      database: { ok: dbOk, latencyMs, error: dbError },
    },
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(body, { status: dbOk ? 200 : 503 })
}
