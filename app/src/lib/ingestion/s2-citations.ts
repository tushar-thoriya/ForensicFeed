import { S2_BASE, s2Request, sleep } from '@/lib/ingestion/s2-http'

const S2_BATCH_ENDPOINT = `${S2_BASE}/paper/batch`
// Hard ceiling enforced by the API: "list of ids must be <= 500".
const S2_BATCH_MAX_IDS = 500
const S2_BATCH_FIELDS = 'citationCount'

export interface CitationLookupOptions {
  apiKey?: string | null
  throttleMs?: number
}

export interface PaperIdentifiers {
  arxivId: string | null
  doi: string | null
}

// S2 resolves external ids by prefix. arXiv first — it is the identifier our
// own dedup treats as strongest, so it is the one most rows carry.
export function toBatchId(row: PaperIdentifiers): string | null {
  if (row.arxivId) return `ARXIV:${row.arxivId}`
  if (row.doi) return `DOI:${row.doi}`
  return null
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function readCitationCount(entry: unknown): number | null {
  if (!entry || typeof entry !== 'object') return null
  const value = (entry as { citationCount?: unknown }).citationCount
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Resolves citation counts for prefixed S2 ids.
 *
 * The batch endpoint returns an array positionally aligned with the request
 * ids, using `null` for ids it could not resolve — so results must be zipped by
 * index. Treating it as a dense list would shift every count after the first
 * miss onto the wrong paper.
 */
export async function fetchCitationCounts(
  ids: readonly string[],
  options: CitationLookupOptions = {},
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (ids.length === 0) return counts

  const throttleMs = options.throttleMs ?? 1100
  const batches = chunk(ids, S2_BATCH_MAX_IDS)

  for (const [index, batch] of batches.entries()) {
    if (index > 0) await sleep(throttleMs)

    let payload: unknown
    try {
      payload = await s2Request(`${S2_BATCH_ENDPOINT}?fields=${S2_BATCH_FIELDS}`, {
        apiKey: options.apiKey,
        // See the adapter: only tests (throttleMs 0) collapse the retry curve.
        ...(throttleMs > 0 ? {} : { backoffMs: 0 }),
        body: { ids: batch },
      })
    } catch (error) {
      // One dead chunk must not discard the counts already resolved.
      console.error('[s2-citations] batch failed', {
        batchIndex: index,
        size: batch.length,
        error: error instanceof Error ? error.message : 'unknown error',
      })
      continue
    }

    if (!Array.isArray(payload)) continue
    batch.forEach((id, position) => {
      const count = readCitationCount(payload[position])
      if (count !== null) counts.set(id, count)
    })
  }

  return counts
}
