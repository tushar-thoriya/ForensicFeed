import { inngest } from '@/lib/inngest/client'
import { cvfAdapter } from '@/lib/ingestion/adapters/cvf'
import { runAdapter } from '@/lib/ingestion/run'
import { getEnv } from '@/lib/env'
import { ONE_DAY_MS, monthsAgo, parseIngestEvent } from '@/lib/inngest/utils'

// Conference proceedings change once a year per venue, so a weekly cron is
// generous. Monday 07:00 UTC keeps it well clear of the daily arXiv/HF/S2 jobs.
const CVF_CRON = '0 7 * * 1'

// Default venue list — overridable via INGESTION_CVF_VENUES env var (CSV).
const DEFAULT_CVF_VENUES = ['CVPR2024', 'ICCV2023', 'WACV2024']

function readVenuesFromEnv(): string[] {
  const raw = process.env.INGESTION_CVF_VENUES?.trim()
  if (!raw) return DEFAULT_CVF_VENUES
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return parsed.length > 0 ? parsed : DEFAULT_CVF_VENUES
}

export const ingestCvfWeekly = inngest.createFunction(
  {
    id: 'ingest-cvf-weekly',
    name: 'Weekly CVF proceedings ingest (image forgery)',
  },
  { cron: CVF_CRON },
  async ({ step }) => {
    const now = new Date()
    // CVF papers don't change frequently — look back a generous window so a
    // missed week is harmless.
    const since = new Date(now.getTime() - ONE_DAY_MS * 14)
    const venues = readVenuesFromEnv()
    return step.run('run-cvf', () =>
      runAdapter(cvfAdapter, { since, now, venues }),
    )
  },
)

export const ingestCvfManual = inngest.createFunction(
  { id: 'ingest-cvf-manual', name: 'Manual CVF proceedings ingest' },
  { event: 'ingest/cvf.manual' },
  async ({ event, step }) => {
    const env = getEnv()
    const now = new Date()
    const { seed, since: parsedSince } = parseIngestEvent(event.data)
    const since =
      parsedSince ??
      (seed ? monthsAgo(env.INGESTION_SEED_MONTHS, now) : new Date(now.getTime() - ONE_DAY_MS * 14))
    const venues = readVenuesFromEnv()
    return step.run('run-cvf', () =>
      runAdapter(cvfAdapter, { since, now, venues }),
    )
  },
)

export const cvfFunctions = [ingestCvfWeekly, ingestCvfManual]
