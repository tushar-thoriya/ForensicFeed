import { inngest } from '@/lib/inngest/client'
import { openReviewAdapter } from '@/lib/ingestion/adapters/openreview'
import { runAdapter } from '@/lib/ingestion/run'
import { getEnv } from '@/lib/env'
import { ONE_DAY_MS, monthsAgo, parseIngestEvent } from '@/lib/inngest/utils'
import { SCHEDULES } from '@config/schedules'

const DEFAULT_OPENREVIEW_VENUES = ['ICLR.cc/', 'NeurIPS.cc/']

// Conference papers publish in annual bursts (ICLR/NeurIPS submissions land in
// one ~September wave), not as a steady weekly stream. A narrow "last N days"
// window therefore misses them ~50 weeks a year. Instead the weekly job re-sweeps
// a wide rolling window every run; dedup (title_hash) makes re-ingesting the same
// papers a no-op, so the only effect is that new conference papers are never missed.
const OPENREVIEW_LOOKBACK_MONTHS = 24

function readVenuesFromEnv(): string[] {
  const raw = process.env.INGESTION_OPENREVIEW_VENUES?.trim()
  if (!raw) return DEFAULT_OPENREVIEW_VENUES
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return parsed.length > 0 ? parsed : DEFAULT_OPENREVIEW_VENUES
}

export const ingestOpenReviewWeekly = inngest.createFunction(
  {
    id: 'ingest-openreview-weekly',
    name: 'Weekly OpenReview ingest (image forgery)',
  },
  { cron: SCHEDULES.openReview },
  async ({ step }) => {
    const now = new Date()
    const since = monthsAgo(OPENREVIEW_LOOKBACK_MONTHS, now)
    const venues = readVenuesFromEnv()
    return step.run('run-openreview', () => runAdapter(openReviewAdapter, { since, now, venues }))
  },
)

export const ingestOpenReviewManual = inngest.createFunction(
  { id: 'ingest-openreview-manual', name: 'Manual OpenReview ingest' },
  { event: 'ingest/openreview.manual' },
  async ({ event, step }) => {
    const env = getEnv()
    const now = new Date()
    const { seed, since: parsedSince } = parseIngestEvent(event.data)
    const since =
      parsedSince ??
      (seed ? monthsAgo(env.INGESTION_SEED_MONTHS, now) : new Date(now.getTime() - ONE_DAY_MS * 14))
    const venues = readVenuesFromEnv()
    return step.run('run-openreview', () => runAdapter(openReviewAdapter, { since, now, venues }))
  },
)

export const openReviewFunctions = [ingestOpenReviewWeekly, ingestOpenReviewManual]
