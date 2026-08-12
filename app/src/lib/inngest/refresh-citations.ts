import { inngest } from '@/lib/inngest/client'
import { refreshCitationCounts } from '@/lib/ingestion/refresh-citations'
import { getEnv } from '@/lib/env'
import { SCHEDULES } from '@config/schedules'

// Citation counts only ever arrive from Semantic Scholar, so every arXiv, CVF,
// OpenReview and HuggingFace row lands with a null count. This backfills them.
export const refreshCitationsWeekly = inngest.createFunction(
  { id: 'refresh-citations-weekly', name: 'Weekly citation-count backfill (Semantic Scholar)' },
  { cron: SCHEDULES.refreshCitations },
  async ({ step }) =>
    step.run('refresh-citations', () =>
      refreshCitationCounts({ apiKey: getEnv().SEMANTIC_SCHOLAR_API_KEY ?? null }),
    ),
)

export const refreshCitationsManual = inngest.createFunction(
  { id: 'refresh-citations-manual', name: 'Manual citation-count backfill' },
  { event: 'ingest/refresh-citations.manual' },
  async ({ step }) =>
    step.run('refresh-citations', () =>
      refreshCitationCounts({ apiKey: getEnv().SEMANTIC_SCHOLAR_API_KEY ?? null }),
    ),
)

export const refreshCitationsFunctions = [refreshCitationsWeekly, refreshCitationsManual]
