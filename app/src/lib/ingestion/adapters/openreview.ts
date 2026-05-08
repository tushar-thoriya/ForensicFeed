import type { Adapter, AdapterFetchOptions } from '@/lib/ingestion/types'
import type { NormalisedPaper } from '@/types/paper'
import { extractCodeUrl } from '@/lib/ingestion/code-url'
import { sanitiseExternalUrl } from '@/lib/security/url'

const OR_BASE = 'https://api2.openreview.net'
const OR_PDF_BASE = 'https://openreview.net'
const OR_FETCH_TIMEOUT_MS = 30_000

// OpenReview PDF paths follow this exact shape. Anything else (path
// traversal, query strings, redirects to other endpoints) is rejected
// before we concatenate to the base URL.
const OR_PDF_PATH_RE = /^\/pdf\/[A-Za-z0-9_-]+\.pdf$/
const PAGE_LIMIT = 100
const MAX_PAGES = 5

const QUERIES = [
  'image forgery detection',
  'image manipulation localization',
  'deepfake detection',
  'image splicing detection',
] as const

const DEFAULT_VENUE_PREFIXES = ['ICLR.cc/', 'NeurIPS.cc/'] as const

interface ORValueWrapper<T> {
  value?: T
}

interface ORNoteContent {
  title?: ORValueWrapper<string>
  authors?: ORValueWrapper<string[]>
  abstract?: ORValueWrapper<string>
  pdf?: ORValueWrapper<string>
  venue?: ORValueWrapper<string>
  venueid?: ORValueWrapper<string>
  keywords?: ORValueWrapper<string[]>
}

interface ORNote {
  id?: string
  forum?: string
  domain?: string
  cdate?: number
  pdate?: number
  content?: ORNoteContent
}

interface ORSearchResponse {
  notes?: ORNote[]
  count?: number
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function deriveVenueLabel(domain: string): { label: string; year: number | null } {
  // Domain shape: 'ICLR.cc/2025/Conference' or 'NeurIPS.cc/2024/Conference'
  const parts = domain.split('/')
  const family = parts[0]?.replace(/\.cc$/, '') ?? domain
  const yearStr = parts[1]
  const year = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : null
  return {
    label: year ? `${family} ${year}` : family,
    year,
  }
}

function matchesAnyPrefix(domain: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => domain.startsWith(p))
}

export function parseOpenReviewSearch(
  payload: unknown,
  venuePrefixes: readonly string[],
): NormalisedPaper[] {
  if (!payload || typeof payload !== 'object') return []
  const response = payload as ORSearchResponse
  if (!Array.isArray(response.notes)) return []

  const out: NormalisedPaper[] = []
  for (const note of response.notes) {
    const domain = note.domain
    if (!isNonEmptyString(domain)) continue
    if (!matchesAnyPrefix(domain, venuePrefixes)) continue

    const venueId = note.content?.venueid?.value
    // Skip withdrawn / desk-rejected / etc — anything with a non-canonical suffix.
    if (isNonEmptyString(venueId) && /Withdrawn|Desk_Rejected|Rejected_Submission/i.test(venueId)) {
      continue
    }

    const content = note.content
    if (!content) continue

    const title = content.title?.value
    if (!isNonEmptyString(title)) continue

    const pdfPath = content.pdf?.value
    if (!isNonEmptyString(pdfPath)) continue
    const normalisedPath = pdfPath.startsWith('/') ? pdfPath : `/${pdfPath}`
    if (!OR_PDF_PATH_RE.test(normalisedPath)) continue
    const pdfUrl = sanitiseExternalUrl(`${OR_PDF_BASE}${normalisedPath}`)
    if (!pdfUrl) continue

    const cdate = typeof note.cdate === 'number' ? note.cdate : null
    if (cdate === null) continue
    const publishedDate = new Date(cdate)
    if (Number.isNaN(publishedDate.getTime())) continue

    const authorsValue = content.authors?.value
    const authors = Array.isArray(authorsValue) ? authorsValue.filter(isNonEmptyString) : []

    const abstractValue = content.abstract?.value
    const abstract = isNonEmptyString(abstractValue) ? abstractValue : null

    const codeUrl = abstract ? extractCodeUrl(abstract) : null

    const { label, year } = deriveVenueLabel(domain)

    out.push({
      title,
      authors,
      abstract,
      arxivId: null,
      doi: null,
      venue: label,
      venueType: 'conference',
      year,
      publishedDate,
      updatedDate: null,
      pdfUrl,
      codeUrl,
      citationCount: null,
      primarySource: 'openreview',
      rawMetadata: {
        openreviewId: note.id ?? null,
        forum: note.forum ?? null,
        domain,
        venueId: venueId ?? null,
        keywords: note.content?.keywords?.value ?? [],
      },
    })
  }

  return out
}

async function fetchOnce(
  query: string,
  offset: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OR_FETCH_TIMEOUT_MS)

  try {
    const url = new URL(`${OR_BASE}/notes/search`)
    url.searchParams.set('query', query)
    url.searchParams.set('content', 'all')
    url.searchParams.set('type', 'terms')
    url.searchParams.set('source', 'forum')
    url.searchParams.set('limit', String(PAGE_LIMIT))
    url.searchParams.set('offset', String(offset))

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`OpenReview API returned ${response.status}: ${response.statusText}`)
    }
    return (await response.json()) as unknown
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenReview API timed out after ${OR_FETCH_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export const openReviewAdapter: Adapter = {
  source: 'openreview',
  async fetch({ since, venues }: AdapterFetchOptions): Promise<NormalisedPaper[]> {
    const venuePrefixes = venues && venues.length > 0 ? venues : [...DEFAULT_VENUE_PREFIXES]
    const seen = new Map<string, NormalisedPaper>()
    let lastError: Error | null = null

    for (const query of QUERIES) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const offset = page * PAGE_LIMIT
        let payload: unknown
        try {
          payload = await fetchOnce(query, offset)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('unknown OpenReview error')
          break // stop paginating this query, move to next
        }
        const batch = parseOpenReviewSearch(payload, venuePrefixes)
        if (batch.length === 0) break
        for (const paper of batch) {
          if (paper.publishedDate < since) continue
          const key = String(paper.rawMetadata?.openreviewId ?? paper.title)
          if (!seen.has(key)) seen.set(key, paper)
        }
        if (batch.length < PAGE_LIMIT) break
      }
    }

    // Match the simpler A2 contract: only throw when nothing was retrieved AND
    // at least one query errored. lastError is never cleared mid-sweep.
    if (seen.size === 0 && lastError) {
      throw new Error(`OpenReview sweep failed: ${lastError.message}`)
    }
    return Array.from(seen.values())
  },
}
