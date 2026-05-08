import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { inngest } from '@/lib/inngest/client'
import { getEnv } from '@/lib/env'

const bodySchema = z
  .object({
    seed: z.boolean().optional(),
    since: z.string().datetime().optional(),
  })
  .strict()

interface TriggerResponse {
  success: boolean
  data?: { eventIds: string[] }
  error?: string
}

// Constant-time-ish comparison so a timing oracle can't infer the secret one
// byte at a time. Lengths differ → unequal; lengths match → XOR every byte.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function createManualIngestHandler(eventName: string) {
  return async function POST(
    request: Request,
  ): Promise<NextResponse<TriggerResponse>> {
    const expected = getEnv().INGEST_TRIGGER_SECRET
    // When INGEST_TRIGGER_SECRET is unset the route stays callable in dev.
    // Production deploy (A8) will require the env var via env-prod.ts.
    if (expected) {
      const provided = request.headers.get('x-ingest-secret') ?? ''
      if (!safeEqual(provided, expected)) {
        return NextResponse.json(
          { success: false, error: 'unauthorized' },
          { status: 401 },
        )
      }
    }

    let payload: z.infer<typeof bodySchema> = {}
    if (request.headers.get('content-type')?.includes('application/json')) {
      try {
        const raw = await request.json()
        payload = bodySchema.parse(raw)
      } catch (error: unknown) {
        const message =
          error instanceof ZodError
            ? 'request body did not match expected shape'
            : 'invalid JSON body'
        return NextResponse.json({ success: false, error: message }, { status: 400 })
      }
    }

    try {
      const result = await inngest.send({ name: eventName, data: payload })
      return NextResponse.json({ success: true, data: { eventIds: result.ids } })
    } catch (error: unknown) {
      // The raw Inngest error can include event-key fragments and SDK
      // internals — log server-side, return a fixed message.
      console.error(`[ingest:${eventName}] dispatch error`, error)
      return NextResponse.json(
        { success: false, error: 'failed to dispatch event' },
        { status: 500 },
      )
    }
  }
}
