import { inngest } from '@/lib/inngest/client'
import { arxivAdapter } from '@/lib/ingestion/adapters/arxiv'
import { runAdapter } from '@/lib/ingestion/run'
import { getEnv } from '@/lib/env'

const SIX_MONTH_MS = 1000 * 60 * 60 * 24 * 30 * 6
const ONE_DAY_MS = 1000 * 60 * 60 * 24

function monthsAgo(months: number, now: Date): Date {
  const copy = new Date(now)
  copy.setUTCMonth(copy.getUTCMonth() - months)
  return copy
}

export const ingestArxivDaily = inngest.createFunction(
  { id: 'ingest-arxiv-daily', name: 'Daily arXiv ingest (image forgery)' },
  { cron: '0 6 * * *' },
  async ({ step }) => {
    const env = getEnv()
    const now = new Date()
    const since = new Date(now.getTime() - ONE_DAY_MS * 2)
    const result = await step.run('run-arxiv', () =>
      runAdapter(arxivAdapter, {
        since,
        now,
        maxResults: env.INGESTION_ARXIV_MAX_RESULTS,
      }),
    )
    return result
  },
)

export const ingestArxivManual = inngest.createFunction(
  { id: 'ingest-arxiv-manual', name: 'Manual arXiv ingest' },
  { event: 'ingest/arxiv.manual' },
  async ({ event, step }) => {
    const env = getEnv()
    const now = new Date()
    const seed = Boolean(event.data?.seed)
    const sinceInput = event.data?.since as string | undefined
    const since = sinceInput
      ? new Date(sinceInput)
      : seed
        ? monthsAgo(env.INGESTION_SEED_MONTHS, now)
        : new Date(now.getTime() - ONE_DAY_MS * 2)

    const result = await step.run('run-arxiv', () =>
      runAdapter(arxivAdapter, {
        since,
        now,
        maxResults: seed ? env.INGESTION_ARXIV_MAX_RESULTS * 2 : env.INGESTION_ARXIV_MAX_RESULTS,
      }),
    )
    return result
  },
)

export const arxivFunctions = [ingestArxivDaily, ingestArxivManual]

export { SIX_MONTH_MS, ONE_DAY_MS, monthsAgo }
