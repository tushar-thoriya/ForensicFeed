import { inngest } from '@/lib/inngest/client'
import { semanticScholarAdapter } from '@/lib/ingestion/adapters/semantic-scholar'
import { runAdapter } from '@/lib/ingestion/run'
import { getEnv } from '@/lib/env'
import { ONE_DAY_MS, monthsAgo, parseIngestEvent } from '@/lib/inngest/utils'

export const ingestSemanticScholarDaily = inngest.createFunction(
  {
    id: 'ingest-semantic-scholar-daily',
    name: 'Daily Semantic Scholar ingest (image forgery)',
  },
  { cron: '30 6 * * *' },
  async ({ step }) => {
    const now = new Date()
    const since = new Date(now.getTime() - ONE_DAY_MS * 2)
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
      (seed ? monthsAgo(env.INGESTION_SEED_MONTHS, now) : new Date(now.getTime() - ONE_DAY_MS * 2))
    return step.run('run-semantic-scholar', () =>
      runAdapter(semanticScholarAdapter, { since, now }),
    )
  },
)

export const semanticScholarFunctions = [
  ingestSemanticScholarDaily,
  ingestSemanticScholarManual,
]
