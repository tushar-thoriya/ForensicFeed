import { inngest } from '@/lib/inngest/client'
import { huggingfaceAdapter } from '@/lib/ingestion/adapters/huggingface'
import { runAdapter } from '@/lib/ingestion/run'
import { getEnv } from '@/lib/env'
import { ONE_DAY_MS, monthsAgo, parseIngestEvent } from '@/lib/inngest/utils'

export const ingestHuggingfaceDaily = inngest.createFunction(
  {
    id: 'ingest-huggingface-daily',
    name: 'Daily Hugging Face Papers ingest (image forgery)',
  },
  { cron: '15 6 * * *' },
  async ({ step }) => {
    const now = new Date()
    const since = new Date(now.getTime() - ONE_DAY_MS * 2)
    return step.run('run-huggingface', () =>
      runAdapter(huggingfaceAdapter, { since, now }),
    )
  },
)

export const ingestHuggingfaceManual = inngest.createFunction(
  { id: 'ingest-huggingface-manual', name: 'Manual Hugging Face Papers ingest' },
  { event: 'ingest/huggingface.manual' },
  async ({ event, step }) => {
    const env = getEnv()
    const now = new Date()
    const { seed, since: parsedSince } = parseIngestEvent(event.data)
    const since =
      parsedSince ??
      (seed ? monthsAgo(env.INGESTION_SEED_MONTHS, now) : new Date(now.getTime() - ONE_DAY_MS * 2))
    return step.run('run-huggingface', () =>
      runAdapter(huggingfaceAdapter, { since, now }),
    )
  },
)

export const huggingfaceFunctions = [ingestHuggingfaceDaily, ingestHuggingfaceManual]
