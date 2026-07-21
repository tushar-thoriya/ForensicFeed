import { inngest } from '@/lib/inngest/client'
import { greatzhAdapter } from '@/lib/ingestion/adapters/greatzh'
import { runAdapter } from '@/lib/ingestion/run'
import { getEnv } from '@/lib/env'
import { ONE_DAY_MS, monthsAgo, parseIngestEvent } from '@/lib/inngest/utils'
import { SCHEDULES } from '@config/schedules'

export const ingestGreatzhWeekly = inngest.createFunction(
  {
    id: 'ingest-greatzh-weekly',
    name: 'Weekly greatzh/papers curated list ingest',
  },
  { cron: SCHEDULES.greatzh },
  async ({ step }) => {
    const now = new Date()
    // The README is re-fetched and re-parsed in full every run — there is no
    // "new since X" semantic to apply upstream. A generous lookback window
    // makes a missed week harmless; DB upsert (arxivId dedup) handles the rest.
    const since = new Date(now.getTime() - ONE_DAY_MS * 14)
    return step.run('run-greatzh', () => runAdapter(greatzhAdapter, { since, now }))
  },
)

export const ingestGreatzhManual = inngest.createFunction(
  { id: 'ingest-greatzh-manual', name: 'Manual greatzh/papers curated list ingest' },
  { event: 'ingest/greatzh.manual' },
  async ({ event, step }) => {
    const env = getEnv()
    const now = new Date()
    const { seed, since: parsedSince } = parseIngestEvent(event.data)
    const since =
      parsedSince ??
      (seed ? monthsAgo(env.INGESTION_SEED_MONTHS, now) : new Date(now.getTime() - ONE_DAY_MS * 14))
    return step.run('run-greatzh', () => runAdapter(greatzhAdapter, { since, now }))
  },
)

export const greatzhFunctions = [ingestGreatzhWeekly, ingestGreatzhManual]
