import type { Adapter, AdapterFetchOptions } from '@/lib/ingestion/types'
import type { NormalisedPaper } from '@/types/paper'
import { extractCodeUrl } from '@/lib/ingestion/code-url'
import { sanitiseExternalUrl } from '@/lib/security/url'
import { getEnv } from '@/lib/env'

const S2_ENDPOINT = 'https://api.semanticscholar.org/graph/v1/paper/search'
const S2_FIELDS = [
  'title',
  'abstract',
  'authors',
  'externalIds',
  'year',
  'publicationDate',
  'openAccessPdf',
  'citationCount',
].join(',')
const S2_FETCH_TIMEOUT_MS = 30_000

const QUERIES = [
  'image forgery detection',
  'image manipulation localization',
  'deepfake detection',
  'image splicing detection',
] as const

interface S2Author {
  authorId?: string | null
  name?: string | null
}

interface S2OpenAccessPdf {
  url?: string | null
}

interface S2ExternalIds {
  ArXiv?: string | null
  DOI?: string | null
}

interface S2Paper {
  paperId?: string | null
  title?: string | null
  abstract?: string | null
  authors?: S2Author[] | null
  externalIds?: S2ExternalIds | null
  year?: number | null
  publicationDate?: string | null
  openAccessPdf?: S2OpenAccessPdf | null
  citationCount?: number | null
}

interface S2SearchResponse {
  total?: number
  offset?: number
  next?: number | null
  data?: S2Paper[]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function pickPublishedDate(paper: S2Paper): Date | null {
  if (isNonEmptyString(paper.publicationDate)) {
    const parsed = new Date(paper.publicationDate)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (typeof paper.year === 'number' && Number.isFinite(paper.year)) {
    // Year-only fallback: pin to Jan 1 so the row sorts deterministically.
    return new Date(Date.UTC(paper.year, 0, 1))
  }
  return null
}

export function parseSemanticScholarSearch(payload: unknown): NormalisedPaper[] {
  if (!payload || typeof payload !== 'object') return []
  const response = payload as S2SearchResponse
  if (!Array.isArray(response.data)) return []

  const out: NormalisedPaper[] = []
  for (const paper of response.data) {
    if (!paper) continue
    const title = isNonEmptyString(paper.title) ? paper.title : null
    if (!title) continue

    const publishedDate = pickPublishedDate(paper)
    if (!publishedDate) continue

    const rawArxivId = paper.externalIds?.ArXiv
    const arxivId = isNonEmptyString(rawArxivId) ? rawArxivId : null
    const rawDoi = paper.externalIds?.DOI
    const doi = isNonEmptyString(rawDoi) ? rawDoi : null

    const authors: string[] = []
    for (const author of paper.authors ?? []) {
      const name = author?.name
      if (isNonEmptyString(name)) authors.push(name)
    }

    const abstract = isNonEmptyString(paper.abstract) ? paper.abstract : null
    // openAccessPdf.url is upstream-controlled — clamp to http(s) before
    // storing. A javascript: scheme would render as an executable anchor.
    const pdfUrl = sanitiseExternalUrl(paper.openAccessPdf?.url ?? null)

    const codeUrl = extractCodeUrl(abstract) ?? extractCodeUrl(title)

    const citationCount =
      typeof paper.citationCount === 'number' && Number.isFinite(paper.citationCount)
        ? paper.citationCount
        : null

    out.push({
      title,
      authors,
      abstract,
      arxivId,
      doi,
      venue: 'Semantic Scholar',
      venueType: arxivId ? 'arxiv' : 'preprint',
      year: typeof paper.year === 'number' ? paper.year : publishedDate.getUTCFullYear(),
      publishedDate,
      updatedDate: null,
      pdfUrl,
      codeUrl,
      citationCount,
      primarySource: 'semantic_scholar',
      rawMetadata: {
        s2PaperId: paper.paperId ?? null,
      },
    })
  }
  return out
}

async function fetchOnce(query: string, apiKey: string | null): Promise<NormalisedPaper[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), S2_FETCH_TIMEOUT_MS)

  const url = `${S2_ENDPOINT}?query=${encodeURIComponent(query)}&limit=100&fields=${S2_FIELDS}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers['x-api-key'] = apiKey

  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      throw new Error(
        `Semantic Scholar API returned ${response.status}: ${response.statusText}`,
      )
    }
    const json = (await response.json()) as unknown
    return parseSemanticScholarSearch(json)
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Semantic Scholar API timed out after ${S2_FETCH_TIMEOUT_MS}ms`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// Light client-side throttle to stay under the 1 req/sec unauth limit.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const semanticScholarAdapter: Adapter = {
  source: 'semantic_scholar',
  async fetch({ since, apiKey: providedKey }: AdapterFetchOptions): Promise<NormalisedPaper[]> {
    // Treat `apiKey: null` as an explicit "no key" signal (so callers can
    // disable env lookup, e.g. in tests). Only fall through to env when the
    // caller didn't pass `apiKey` at all.
    const apiKey =
      providedKey !== undefined ? providedKey : getEnv().SEMANTIC_SCHOLAR_API_KEY ?? null
    const throttleMs = apiKey ? 0 : 1100

    const seen = new Map<string, NormalisedPaper>()
    let lastError: Error | null = null

    for (const query of QUERIES) {
      let batch: NormalisedPaper[] = []
      try {
        batch = await fetchOnce(query, apiKey)
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('unknown S2 error')
        if (throttleMs > 0) await sleep(throttleMs)
        continue
      }
      for (const paper of batch) {
        if (paper.publishedDate < since) continue
        const key = paper.arxivId ?? paper.doi ?? paper.title
        const existing = seen.get(key)
        if (!existing) seen.set(key, paper)
      }
      if (throttleMs > 0) await sleep(throttleMs)
    }

    if (seen.size === 0 && lastError) {
      throw new Error(`Semantic Scholar sweep failed: ${lastError.message}`)
    }
    return Array.from(seen.values())
  },
}
