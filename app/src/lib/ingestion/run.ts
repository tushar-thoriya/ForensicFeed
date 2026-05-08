import { upsertPaper } from '@/lib/db/queries/papers'
import { finishRun, startRun } from '@/lib/db/queries/ingest-runs'
import type { Adapter, RunResult } from '@/lib/ingestion/types'

export interface RunAdapterOptions {
  since: Date
  now?: Date
  maxResults?: number
  venues?: string[]
}

export async function runAdapter(
  adapter: Adapter,
  options: RunAdapterOptions,
): Promise<RunResult> {
  const now = options.now ?? new Date()
  const startedAt = new Date()
  const runId = await startRun(adapter.source)

  let papersFetched = 0
  let papersInserted = 0
  let papersUpdated = 0
  let errorMessage: string | null = null
  let status: 'success' | 'partial' | 'failed' = 'success'

  try {
    const fetchOptions = {
      since: options.since,
      now,
      ...(options.maxResults !== undefined ? { maxResults: options.maxResults } : {}),
      ...(options.venues !== undefined ? { venues: options.venues } : {}),
    }
    const results = await adapter.fetch(fetchOptions)
    papersFetched = results.length

    for (const paper of results) {
      try {
        const { inserted } = await upsertPaper(paper)
        if (inserted) papersInserted += 1
        else papersUpdated += 1
      } catch (error) {
        status = 'partial'
        const msg = error instanceof Error ? error.message : 'unknown upsert error'
        errorMessage = errorMessage ? `${errorMessage}; ${msg}` : msg
      }
    }
  } catch (error) {
    status = 'failed'
    errorMessage = error instanceof Error ? error.message : 'unknown fetch error'
  }

  const finishedAt = new Date()
  await finishRun({
    id: runId,
    status,
    papersFetched,
    papersInserted,
    papersUpdated,
    errorMessage,
  })

  return {
    source: adapter.source,
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    papersFetched,
    papersInserted,
    papersUpdated,
    status,
    errorMessage,
  }
}
