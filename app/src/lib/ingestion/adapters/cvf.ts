import * as cheerio from 'cheerio'
import type { Adapter, AdapterFetchOptions } from '@/lib/ingestion/types'
import type { NormalisedPaper } from '@/types/paper'
import { extractCodeUrl } from '@/lib/ingestion/code-url'
import { extractArxivIdFromUrl } from '@/lib/ingestion/arxiv-id'
import { sanitiseExternalUrl } from '@/lib/security/url'

const CVF_BASE = 'https://openaccess.thecvf.com'
const CVF_FETCH_TIMEOUT_MS = 30_000
const CVF_MAX_ATTEMPTS = 3
const CVF_RETRY_DELAY_MS = 500

const DEFAULT_VENUES = ['CVPR2024', 'ICCV2023', 'WACV2024'] as const

// Forgery keyword filter — case-insensitive title match. Mirrors the arXiv
// keyword sweep but applied client-side after scraping the proceedings page,
// since CVF has no search API.
const FORGERY_KEYWORDS = [
  'forgery',
  'forensic',
  'forensics',
  'tamper',
  'tampering',
  'manipulation',
  'deepfake',
  'splicing',
  'copy-move',
  'inpainting',
] as const

// Coarse "month" map per venue family — used to anchor `publishedDate` to the
// conference month rather than the full year. Good enough for sort ordering.
const VENUE_MONTH: Record<string, number> = {
  CVPR: 5, // June (0-indexed)
  ICCV: 9, // October
  WACV: 0, // January
}

interface VenueInfo {
  family: string // 'CVPR' | 'ICCV' | 'WACV'
  year: number
  label: string // 'CVPR 2024'
}

function parseVenueCode(code: string): VenueInfo | null {
  const match = code.match(/^([A-Z]+)(\d{4})$/)
  if (!match) return null
  const family = match[1]!
  const year = Number(match[2]!)
  return { family, year, label: `${family} ${year}` }
}

function titleMatchesForgery(title: string): boolean {
  const lower = title.toLowerCase()
  return FORGERY_KEYWORDS.some((kw) => lower.includes(kw))
}

function resolveAbsolute(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  return `${CVF_BASE}${href.startsWith('/') ? href : `/${href}`}`
}

export function parseCvfHtml(html: string, venueCode: string): NormalisedPaper[] {
  const venue = parseVenueCode(venueCode)
  if (!venue) return []
  if (!html) return []

  const $ = cheerio.load(html)
  const papers: NormalisedPaper[] = []
  const month = VENUE_MONTH[venue.family] ?? 0
  const publishedDate = new Date(Date.UTC(venue.year, month, 1))

  $('dt.ptitle').each((_, el) => {
    const titleEl = $(el).find('a').first()
    const title = titleEl.text().trim()
    if (!title) return
    if (!titleMatchesForgery(title)) return

    // Authors live in the next <dd>; links live in the <dd> after that.
    const authorsDd = $(el).next('dd')
    const linksDd = authorsDd.next('dd')

    const authors: string[] = []
    authorsDd.find('form.authsearch input[name="query_author"]').each((_, input) => {
      const name = $(input).attr('value')?.trim()
      if (name) authors.push(name)
    })

    let pdfUrl: string | null = null
    let arxivId: string | null = null
    let supplementaryUrl: string | null = null

    linksDd.find('a').each((_, a) => {
      const href = $(a).attr('href')
      const text = $(a).text().trim().toLowerCase()
      if (!href) return
      if (text === 'pdf') {
        pdfUrl = sanitiseExternalUrl(resolveAbsolute(href))
      } else if (text === 'supp') {
        supplementaryUrl = sanitiseExternalUrl(resolveAbsolute(href))
      } else if (text === 'arxiv') {
        const id = extractArxivIdFromUrl(href)
        if (id) arxivId = id
      }
    })

    if (!pdfUrl) return // skip papers without a PDF

    const codeUrl = extractCodeUrl(title)

    papers.push({
      title,
      authors,
      abstract: null,
      arxivId,
      doi: null,
      venue: venue.label,
      venueType: 'conference',
      year: venue.year,
      publishedDate,
      updatedDate: null,
      pdfUrl,
      codeUrl,
      citationCount: null,
      primarySource: 'cvf',
      rawMetadata: {
        venueCode,
        supplementaryUrl,
      },
    })
  })

  return papers
}

// Walk an error's `cause` chain so a bare undici "fetch failed" reveals its real
// underlying reason (e.g. UND_ERR_CONNECT_TIMEOUT, ECONNRESET, UND_ERR_BODY_TIMEOUT).
function describeError(error: unknown): string {
  const parts: string[] = []
  let cur: unknown = error
  for (let depth = 0; cur instanceof Error && depth < 4; depth += 1) {
    const code = (cur as { code?: string }).code
    parts.push(code ? `${cur.name}[${code}]: ${cur.message}` : `${cur.name}: ${cur.message}`)
    cur = (cur as { cause?: unknown }).cause
  }
  return parts.length > 0 ? parts.join(' <- ') : String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Transient = a network-level failure worth retrying: undici's "fetch failed"
// wraps the real cause, and our own AbortController fires an AbortError. HTTP
// status errors are deterministic, so retrying them is pointless.
function isTransient(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return error.cause != null
}

async function attemptVenueFetch(venueCode: string): Promise<NormalisedPaper[]> {
  const url = `${CVF_BASE}/${venueCode}?day=all`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CVF_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        // thecvf.com returns 406 Not Acceptable for a bare `text/html`; it needs
        // a browser-style Accept with a */* fallback to serve the page.
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent':
          'forensicfeed-research-tracker (+https://github.com/tushar-thoriya/ForensicFeed)',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`CVF ${venueCode} returned ${response.status}: ${response.statusText}`)
    }
    const html = await response.text()
    return parseCvfHtml(html, venueCode)
  } finally {
    clearTimeout(timer)
  }
}

// CVF's large proceedings pages occasionally flake from serverless (transient
// "fetch failed"). Retry transient failures a few times with a short linear
// backoff before giving up; deterministic HTTP-status errors are thrown at once.
async function fetchVenue(venueCode: string): Promise<NormalisedPaper[]> {
  let lastError: unknown
  for (let attempt = 1; attempt <= CVF_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await attemptVenueFetch(venueCode)
    } catch (error: unknown) {
      lastError = error
      if (!isTransient(error) || attempt === CVF_MAX_ATTEMPTS) break
      await sleep(CVF_RETRY_DELAY_MS * attempt)
    }
  }

  if (lastError instanceof Error && lastError.name === 'AbortError') {
    throw new Error(
      `CVF ${venueCode} timed out after ${CVF_FETCH_TIMEOUT_MS}ms (${CVF_MAX_ATTEMPTS} attempts)`,
    )
  }
  // Network-level failures ("fetch failed") hide the real reason in `.cause`; surface it.
  if (lastError instanceof Error && lastError.cause) {
    throw new Error(
      `CVF ${venueCode} fetch error after ${CVF_MAX_ATTEMPTS} attempts: ${describeError(lastError)}`,
    )
  }
  throw lastError
}

export const cvfAdapter: Adapter = {
  source: 'cvf',
  async fetch({ venues }: AdapterFetchOptions): Promise<NormalisedPaper[]> {
    // CVF proceedings are static once a conference closes — there is no
    // "new since X" semantic to apply. We always do a full sweep of every
    // configured venue and rely on the DB-layer dedup (arxivId → titleHash)
    // to prevent duplicate inserts on subsequent runs. The Inngest cron
    // therefore wakes weekly, fetches all configured venues, and the upsert
    // path makes the operation idempotent.
    const targetVenues = venues && venues.length > 0 ? venues : [...DEFAULT_VENUES]
    const seen = new Map<string, NormalisedPaper>()
    let lastError: Error | null = null

    for (const venue of targetVenues) {
      let batch: NormalisedPaper[] = []
      try {
        batch = await fetchVenue(venue)
      } catch (error) {
        // Per-venue isolation: one failure must not stop the rest of the sweep.
        lastError = error instanceof Error ? error : new Error('unknown CVF error')
        continue
      }
      for (const paper of batch) {
        const key = `${paper.venue}::${paper.title}`
        if (!seen.has(key)) seen.set(key, paper)
      }
    }

    if (seen.size === 0 && lastError) {
      throw new Error(`CVF sweep failed: ${lastError.message}`)
    }
    return Array.from(seen.values())
  },
}
