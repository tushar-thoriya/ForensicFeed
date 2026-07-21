import { NextResponse } from 'next/server'
import { asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { papers } from '@/lib/db/schema'
import { getEnv } from '@/lib/env'
import { safeEqual } from '@/lib/inngest/manual-trigger'
import { classifyDomain } from '@/lib/ingestion/domain'
import { SECTION_DOMAIN } from '@/lib/ingestion/adapters/greatzh'
import type { PaperDomain } from '@/types/paper'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Keyset page size — bounded memory, one indexed range scan per page.
const BATCH_SIZE = 500

interface BackfillResponse {
  success: boolean
  data?: { scanned: number; updated: number }
  error?: string
}

// greatzh rows carry the curator's section in rawMetadata.section; re-derive
// the domain hint from it so backfill matches what a fresh ingest would assign.
function hintFor(row: {
  primarySource: string
  rawMetadata: Record<string, unknown>
}): PaperDomain | undefined {
  if (row.primarySource !== 'greatzh') return undefined
  const section = row.rawMetadata.section
  if (typeof section !== 'string') return undefined
  return SECTION_DOMAIN.get(section.toLowerCase())
}

// One-off reclassifier for rows that predate the domain column (all defaulted
// to 'forgery' by the migration). Idempotent: only rows whose computed domain
// differs from the stored value are written, so re-running is a safe no-op.
export async function POST(request: Request): Promise<NextResponse<BackfillResponse>> {
  const expected = getEnv().INGEST_TRIGGER_SECRET
  // Unset secret keeps the route callable in dev (mirrors createManualIngestHandler).
  if (expected) {
    const provided = request.headers.get('x-ingest-secret') ?? ''
    if (!safeEqual(provided, expected)) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    let cursor = ''
    let scanned = 0
    let updated = 0

    for (;;) {
      const rows = await db
        .select({
          id: papers.id,
          title: papers.title,
          abstract: papers.abstract,
          domain: papers.domain,
          primarySource: papers.primarySource,
          rawMetadata: papers.rawMetadata,
        })
        .from(papers)
        .where(cursor ? gt(papers.id, cursor) : undefined)
        .orderBy(asc(papers.id))
        .limit(BATCH_SIZE)

      if (rows.length === 0) break

      for (const row of rows) {
        scanned += 1
        const computed = classifyDomain(
          { title: row.title, abstract: row.abstract },
          hintFor(row),
        )
        if (computed !== row.domain) {
          await db.update(papers).set({ domain: computed }).where(eq(papers.id, row.id))
          updated += 1
        }
      }

      cursor = rows[rows.length - 1]!.id
      if (rows.length < BATCH_SIZE) break
    }

    return NextResponse.json({ success: true, data: { scanned, updated } })
  } catch (error: unknown) {
    console.error('[admin:backfill-domain] failed', error)
    return NextResponse.json({ success: false, error: 'backfill failed' }, { status: 500 })
  }
}
