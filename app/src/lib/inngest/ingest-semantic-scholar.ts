import { inngest } from '@/lib/inngest/client'
import { semanticScholarAdapter } from '@/lib/ingestion/adapters/semantic-scholar'
import { runAdapter } from '@/lib/ingestion/run'
import { getEnv } from '@/lib/env'
import { ONE_DAY_MS, monthsAgo, parseIngestEvent } from '@/lib/inngest/utils'
import { SCHEDULES } from '@config/schedules'

// S2 indexes papers days-to-weeks after their publicationDate, and the bulk
// search filters on publicationDate — so a short window silently drops anything
// indexed late: the window has already moved past it by the time it appears.
// A 30-day sweep re-sees each paper ~30 times, which is nearly free because
// upsertPaper turns a repeat into a no-op UPDATE. Measured yield at the current
// publication rate: 7d ≈ 4 papers, 30d ≈ 32 — still a single page per query.
const S2_LOOKBACK_MS = ONE_DAY_MS * 30

export const ingestSemanticScholarDaily = inngest.createFunction(
  {
    id: 'ingest-semantic-scholar-daily',
    name: 'Daily Semantic Scholar ingest (image forgery)',
  },
  { cron: SCHEDULES.semanticScholar },
  async ({ step }) => {
    const now = new Date()
    const since = new Date(now.getTime() - S2_LOOKBACK_MS)
    return step.run('run-semantic-scholar', () =>
      runAdapter(semanticScholarAdapter, { since, now }),
    )
  },
)

export const ingestSemanticScholarManual = inngest.createFunction(
  { id: 'ingest-semantic-scholar-manual', name: 'Manual Semantic Scholar ingest' },
  { event: 'ingest/semantic-scholar.manual' },
  async ({ event, step }) => {
    const env = getEnv()
    const now = new Date()
    const { seed, since: parsedSince } = parseIngestEvent(event.data)
    const since =
      parsedSince ??
      (seed ? monthsAgo(env.INGESTION_SEED_MONTHS, now) : new Date(now.getTime() - S2_LOOKBACK_MS))
    return step.run('run-semantic-scholar', () =>
      runAdapter(semanticScholarAdapter, { since, now }),
    )
  },
)

export const semanticScholarFunctions = [ingestSemanticScholarDaily, ingestSemanticScholarManual]
