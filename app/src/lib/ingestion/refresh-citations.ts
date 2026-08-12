import { findPapersMissingCitations, setCitationCount } from '@/lib/db/queries/papers'
import { fetchCitationCounts, toBatchId } from '@/lib/ingestion/s2-citations'

// One weekly pass covers a corpus far larger than the current ~1k rows, while
// bounding a single run to four batch requests.
const DEFAULT_SCAN_LIMIT = 2000

export interface RefreshCitationsOptions {
  apiKey?: string | null
  throttleMs?: number
  limit?: number
}

export interface RefreshCitationsResult {
  scanned: number
  resolved: number
  updated: number
}

/**
 * Fills in `citation_count` for papers that arrived without one.
 *
 * Only Semantic Scholar exposes citation data, so every arXiv/CVF/OpenReview
 * row lands with a null count. This walks those rows, resolves them through the
 * S2 batch endpoint, and writes back only the counts that actually resolved.
 */
export async function refreshCitationCounts(
  options: RefreshCitationsOptions = {},
): Promise<RefreshCitationsResult> {
  const rows = await findPapersMissingCitations(options.limit ?? DEFAULT_SCAN_LIMIT)
  if (rows.length === 0) return { scanned: 0, resolved: 0, updated: 0 }

  // Rows with neither an arXiv id nor a DOI can never be resolved upstream —
  // sending them would just burn batch slots.
  const resolvable = rows.flatMap((row) => {
    const batchId = toBatchId(row)
    return batchId ? [{ paperId: row.id, batchId }] : []
  })

  const counts = await fetchCitationCounts(
    resolvable.map((entry) => entry.batchId),
    {
      apiKey: options.apiKey ?? null,
      ...(options.throttleMs !== undefined ? { throttleMs: options.throttleMs } : {}),
    },
  )

  let updated = 0
  for (const entry of resolvable) {
    const count = counts.get(entry.batchId)
    if (count === undefined) continue
    try {
      await setCitationCount(entry.paperId, count)
      updated += 1
    } catch (error) {
      console.error('[refresh-citations] update failed', {
        paperId: entry.paperId,
        error: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }

  return { scanned: rows.length, resolved: counts.size, updated }
}
