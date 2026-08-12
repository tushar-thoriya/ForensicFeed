import type { Adapter, AdapterFetchOptions } from '@/lib/ingestion/types'
import type { NormalisedPaper, VenueType } from '@/types/paper'
import { extractCodeUrl } from '@/lib/ingestion/code-url'
import { sanitiseExternalUrl } from '@/lib/security/url'
import { S2_BASE, s2Request, sleep } from '@/lib/ingestion/s2-http'
import { getEnv } from '@/lib/env'

const S2_BULK_ENDPOINT = `${S2_BASE}/paper/search/bulk`
const S2_FIELDS = [
  'title',
  'abstract',
  'authors',
  'externalIds',
  'year',
  'publicationDate',
  'openAccessPdf',
  'citationCount',
  'venue',
  'publicationTypes',
].join(',')

// S2's approved-key rate limit is 1 req/sec cumulative across all endpoints.
// Space requests just over 1s so the sweep stays below the threshold.
const S2_THROTTLE_MS = 1100
// Bulk search returns up to 1000 rows/page. Five pages per query is far more
// than a topic-scoped date window ever produces, and bounds a runaway token.
const S2_MAX_PAGES = 5
// S2 leaves `venue` blank for raw preprints. Label those by where they actually
// live rather than by the aggregator we happened to find them through.
const S2_FALLBACK_VENUE = 'Semantic Scholar'
const S2_ARXIV_VENUE = 'arXiv'

const DEFAULT_QUERIES = [
  'image forgery detection',
  'image manipulation localization',
  'deepfake detection',
  'image splicing detection',
] as const

interface S2Author {
  authorId?: string | null
  name?: string | null
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
  venue?: string | null
  publicationTypes?: string[] | null
  openAccessPdf?: { url?: string | null } | null
  citationCount?: number | null
}

interface S2BulkResponse {
  total?: number
  token?: string | null
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

function pickVenue(paper: S2Paper, arxivId: string | null): string {
  if (isNonEmptyString(paper.venue)) return paper.venue
  return arxivId ? S2_ARXIV_VENUE : S2_FALLBACK_VENUE
}

// An arXiv id is the strongest venue signal we have — it survives dedup against
// the arXiv adapter. Otherwise fall back to what S2 says the paper is.
function pickVenueType(paper: S2Paper, arxivId: string | null): VenueType {
  if (arxivId) return 'arxiv'
  const types = paper.publicationTypes ?? []
  if (types.includes('Conference')) return 'conference'
  if (types.includes('JournalArticle')) return 'journal'
  return 'preprint'
}

export function parseSemanticScholarSearch(payload: unknown): NormalisedPaper[] {
  if (!payload || typeof payload !== 'object') return []
  const response = payload as S2BulkResponse
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
      venue: pickVenue(paper, arxivId),
      venueType: pickVenueType(paper, arxivId),
      year: typeof paper.year === 'number' ? paper.year : publishedDate.getUTCFullYear(),
      publishedDate,
      updatedDate: null,
      pdfUrl,
      codeUrl: extractCodeUrl(abstract) ?? extractCodeUrl(title),
      citationCount,
      primarySource: 'semantic_scholar',
      rawMetadata: { s2PaperId: paper.paperId ?? null },
    })
  }
  return out
}

function buildUrl(query: string, since: Date, token: string | null): string {
  const params = new URLSearchParams({
    query,
    // Server-side recency window. Without this the endpoint would return
    // relevance-ranked classics and every row would fail the `since` filter.
    publicationDateOrYear: `${since.toISOString().slice(0, 10)}:`,
    sort: 'publicationDate:desc',
    fields: S2_FIELDS,
  })
  if (token) params.set('token', token)
  return `${S2_BULK_ENDPOINT}?${params.toString()}`
}

async function fetchQuery(
  query: string,
  since: Date,
  apiKey: string | null,
  throttleMs: number,
): Promise<NormalisedPaper[]> {
  const collected: NormalisedPaper[] = []
  let token: string | null = null

  // throttleMs 0 (tests only) also zeroes retry backoff so suites run instantly.
  // Production omits it so s2Request keeps its own, longer retry curve rather
  // than inheriting the much shorter inter-request spacing.
  const requestOptions = throttleMs > 0 ? { apiKey } : { apiKey, backoffMs: 0 }

  for (let page = 0; page < S2_MAX_PAGES; page += 1) {
    if (page > 0) await sleep(throttleMs)

    const payload: unknown = await s2Request(buildUrl(query, since, token), requestOptions)
    collected.push(...parseSemanticScholarSearch(payload))

    const nextToken = (payload as S2BulkResponse)?.token
    if (!isNonEmptyString(nextToken)) break
    token = nextToken
  }

  return collected
}

export const semanticScholarAdapter: Adapter = {
  source: 'semantic_scholar',
  async fetch({
    since,
    apiKey: providedKey,
    throttleMs: providedThrottleMs,
    queries: providedQueries,
  }: AdapterFetchOptions): Promise<NormalisedPaper[]> {
    // Treat `apiKey: null` as an explicit "no key" signal (so callers can
    // disable env lookup, e.g. in tests). Only fall through to env when the
    // caller didn't pass `apiKey` at all.
    const apiKey =
      providedKey !== undefined ? providedKey : (getEnv().SEMANTIC_SCHOLAR_API_KEY ?? null)
    const throttleMs = providedThrottleMs ?? S2_THROTTLE_MS
    const queries = providedQueries ?? [...DEFAULT_QUERIES]

    const seen = new Map<string, NormalisedPaper>()
    let lastError: Error | null = null
    let succeeded = 0

    for (const query of queries) {
      try {
        for (const paper of await fetchQuery(query, since, apiKey, throttleMs)) {
          // Defensive: if the server ever ignores publicationDateOrYear we must
          // not swallow the entire back catalogue.
          if (paper.publishedDate < since) continue
          const key = paper.arxivId ?? paper.doi ?? paper.title
          if (!seen.has(key)) seen.set(key, paper)
        }
        succeeded += 1
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('unknown S2 error')
      }
      await sleep(throttleMs)
    }

    if (succeeded === 0 && lastError) {
      throw new Error(`Semantic Scholar sweep failed: ${lastError.message}`)
    }
    return Array.from(seen.values())
  },
}
