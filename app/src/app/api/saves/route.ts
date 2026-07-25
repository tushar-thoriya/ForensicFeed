import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { setSaved } from '@/lib/db/queries/saves'
import { FEED_CACHE_TAG } from '@/lib/db/queries/feed-cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// paperId is the same string used as `papers.id` (e.g. `arxiv:2406.12345`)
// — capped to a defensive length to make an upper bound for the body size
// without needing a separate body-parser limit.
const bodySchema = z.object({
  paperId: z.string().min(1).max(200),
  saved: z.boolean(),
})

export async function POST(request: Request): Promise<NextResponse> {
  let parsed: z.infer<typeof bodySchema>
  try {
    const raw: unknown = await request.json()
    parsed = bodySchema.parse(raw)
  } catch (error: unknown) {
    // Never echo the parser's error verbatim — Zod messages can include the
    // user's raw input. Return a generic 400 instead.
    const reason = error instanceof z.ZodError ? 'invalid body' : 'invalid json'
    return NextResponse.json({ ok: false, error: reason }, { status: 400 })
  }

  try {
    await setSaved(parsed.paperId, parsed.saved)
    // Bust the feed data cache so the saved badge is correct on the next feed
    // render (e.g. after the client's router.refresh() or a later tab switch).
    // Best-effort: the write already succeeded, so a revalidation hiccup must
    // not turn a good mutation into a 500 (worst case the cache TTL catches up).
    try {
      revalidateTag(FEED_CACHE_TAG)
    } catch (error: unknown) {
      console.error('[POST /api/saves] cache revalidation failed', error)
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error: unknown) {
    console.error('[POST /api/saves] mutation failed', error)
    return NextResponse.json({ ok: false, error: 'mutation failed' }, { status: 500 })
  }
}
