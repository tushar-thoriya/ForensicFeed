import { z } from 'zod'

export const ONE_DAY_MS = 24 * 60 * 60 * 1000

// UTC-based to keep cron windows stable across deploy regions.
export function monthsAgo(months: number, now: Date = new Date()): Date {
  const result = new Date(now)
  result.setUTCMonth(result.getUTCMonth() - months)
  return result
}

const ingestEventSchema = z
  .object({
    seed: z.boolean().optional(),
    since: z.string().datetime().optional(),
  })
  .partial()

// Inngest delivers `event.data` as `Record<string, unknown>`. Validate before
// constructing a Date — passing a number to `new Date()` silently produces an
// epoch-relative result instead of throwing.
export function parseIngestEvent(data: unknown): { seed: boolean; since: Date | null } {
  const parsed = ingestEventSchema.safeParse(data ?? {})
  if (!parsed.success) return { seed: false, since: null }
  return {
    seed: parsed.data.seed ?? false,
    since: parsed.data.since ? new Date(parsed.data.since) : null,
  }
}
