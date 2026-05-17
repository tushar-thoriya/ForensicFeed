import { NextResponse } from 'next/server'
import { z } from 'zod'
import { setReadStatus } from '@/lib/db/queries/saves'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const bodySchema = z.object({
  paperId: z.string().min(1).max(200),
  // Binary UI in A6 — schema enum has more values but the API only accepts
  // these two. If the UI ever exposes reading/archived, add them here too.
  status: z.enum(['read', 'unread']),
})

export async function POST(request: Request): Promise<NextResponse> {
  let parsed: z.infer<typeof bodySchema>
  try {
    const raw: unknown = await request.json()
    parsed = bodySchema.parse(raw)
  } catch (error: unknown) {
    const reason = error instanceof z.ZodError ? 'invalid body' : 'invalid json'
    return NextResponse.json({ ok: false, error: reason }, { status: 400 })
  }

  try {
    await setReadStatus(parsed.paperId, parsed.status === 'read')
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error: unknown) {
    console.error('[POST /api/read-status] mutation failed', error)
    return NextResponse.json({ ok: false, error: 'mutation failed' }, { status: 500 })
  }
}
