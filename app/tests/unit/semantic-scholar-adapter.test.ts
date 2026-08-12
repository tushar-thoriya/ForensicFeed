// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseSemanticScholarSearch,
  semanticScholarAdapter,
} from '@/lib/ingestion/adapters/semantic-scholar'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/semantic-scholar-bulk.json')

async function loadFixture(): Promise<Record<string, unknown>> {
  const raw = await readFile(fixturePath, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

// A Response body can only be consumed once, so every mock mints a fresh
// Response per call. Sharing one instance makes multi-request tests pass
// vacuously (the second read throws and the adapter swallows it).
function jsonResponse(body: unknown, status = 200): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function mockFetch(...responders: Array<() => Promise<Response>>) {
  const spy = vi.spyOn(globalThis, 'fetch')
  const last = responders[responders.length - 1]!
  responders.slice(0, -1).forEach((r) => spy.mockImplementationOnce(r))
  return spy.mockImplementation(last)
}

function requestUrl(call: unknown[] | undefined): URL {
  return new URL(String(call?.[0]))
}

const SINCE = new Date('2026-08-01T00:00:00Z')
const NOW = new Date('2026-08-12T06:30:00Z')

describe('parseSemanticScholarSearch', () => {
  it('parses a bulk-search response into NormalisedPaper[]', async () => {
    const papers = parseSemanticScholarSearch(await loadFixture())
    expect(papers).toHaveLength(4)

    const first = papers[0]!
    expect(first.title).toBe('Localizing Copy-Move Forgery in Passport Document Images')
    expect(first.arxivId).toBe('2608.08009')
    expect(first.doi).toBe('10.1109/FAKE.2026.01234')
    expect(first.citationCount).toBe(7)
    expect(first.codeUrl).toBe('https://github.com/lab-org/passport-forgery')
    expect(first.pdfUrl).toBe('https://arxiv.org/pdf/2608.08009.pdf')
    expect(first.publishedDate.toISOString()).toBe('2026-08-08T00:00:00.000Z')
    expect(first.primarySource).toBe('semantic_scholar')
  })

  it('carries the real venue through instead of stamping every row "Semantic Scholar"', async () => {
    const papers = parseSemanticScholarSearch(await loadFixture())
    expect(papers[0]!.venue).toBe('IEEE Transactions on Information Forensics and Security')
    expect(papers[1]!.venue).toBe('Proceedings of the ACM International Conference on Multimedia')
  })

  it('falls back to a Semantic Scholar venue label when upstream venue is blank', async () => {
    const papers = parseSemanticScholarSearch(await loadFixture())
    expect(papers[2]!.venue).toBe('Semantic Scholar')
  })

  it('labels a blank-venue preprint as arXiv when it carries an arXiv id', () => {
    const papers = parseSemanticScholarSearch({
      data: [
        {
          title: 'Bare preprint',
          publicationDate: '2026-08-08',
          venue: '',
          externalIds: { ArXiv: '2608.00001' },
        },
      ],
    })
    expect(papers[0]!.venue).toBe('arXiv')
  })

  it('derives venueType from publicationTypes, preferring arxiv when an arXiv id exists', async () => {
    const papers = parseSemanticScholarSearch(await loadFixture())
    // Has an ArXiv id -> arxiv wins over the JournalArticle publicationType.
    expect(papers[0]!.venueType).toBe('arxiv')
    expect(papers[1]!.venueType).toBe('conference')
    // No publicationTypes and no arXiv id -> preprint.
    expect(papers[2]!.venueType).toBe('preprint')
    expect(papers[3]!.venueType).toBe('journal')
  })

  it('sanitises upstream openAccessPdf urls', async () => {
    const papers = parseSemanticScholarSearch(await loadFixture())
    expect(papers[3]!.pdfUrl).toBeNull()
  })

  it('returns empty array for malformed payload', () => {
    expect(parseSemanticScholarSearch(null)).toEqual([])
    expect(parseSemanticScholarSearch({ data: 'not an array' })).toEqual([])
    expect(parseSemanticScholarSearch({})).toEqual([])
  })

  it('skips entries with no usable date or title', () => {
    const papers = parseSemanticScholarSearch({
      data: [
        { title: null, publicationDate: '2026-08-04' },
        { title: 'no date', publicationDate: null, year: null },
        { title: 'good', publicationDate: '2026-08-04', authors: [] },
      ],
    })
    expect(papers).toHaveLength(1)
    expect(papers[0]!.title).toBe('good')
  })
})

describe('semanticScholarAdapter.fetch — request shape', () => {
  afterEach(() => vi.restoreAllMocks())

  it('queries the bulk-search endpoint, not the relevance-search endpoint', async () => {
    const fetchSpy = mockFetch(jsonResponse(await loadFixture()))

    await semanticScholarAdapter.fetch({ since: SINCE, now: NOW, apiKey: 'k', throttleMs: 0 })

    const url = requestUrl(fetchSpy.mock.calls[0])
    expect(url.pathname).toBe('/graph/v1/paper/search/bulk')
  })

  it('pushes the recency window into publicationDateOrYear instead of filtering client-side', async () => {
    const fetchSpy = mockFetch(jsonResponse(await loadFixture()))

    await semanticScholarAdapter.fetch({ since: SINCE, now: NOW, apiKey: 'k', throttleMs: 0 })

    const url = requestUrl(fetchSpy.mock.calls[0])
    expect(url.searchParams.get('publicationDateOrYear')).toBe('2026-08-01:')
  })

  it('sorts newest-first so the first page holds the most recent papers', async () => {
    const fetchSpy = mockFetch(jsonResponse(await loadFixture()))

    await semanticScholarAdapter.fetch({ since: SINCE, now: NOW, apiKey: 'k', throttleMs: 0 })

    const url = requestUrl(fetchSpy.mock.calls[0])
    expect(url.searchParams.get('sort')).toBe('publicationDate:desc')
  })

  it('requests venue and publicationTypes so venue metadata survives', async () => {
    const fetchSpy = mockFetch(jsonResponse(await loadFixture()))

    await semanticScholarAdapter.fetch({ since: SINCE, now: NOW, apiKey: 'k', throttleMs: 0 })

    const fields = (requestUrl(fetchSpy.mock.calls[0]).searchParams.get('fields') ?? '').split(',')
    expect(fields).toContain('venue')
    expect(fields).toContain('publicationTypes')
    expect(fields).toContain('citationCount')
  })

  it('passes the API key as x-api-key header when provided', async () => {
    const fetchSpy = mockFetch(jsonResponse(await loadFixture()))

    await semanticScholarAdapter.fetch({
      since: SINCE,
      now: NOW,
      apiKey: 'test-key-abc',
      throttleMs: 0,
    })

    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>
    expect(headers['x-api-key']).toBe('test-key-abc')
  })

  it('omits x-api-key header when no key is provided', async () => {
    const fetchSpy = mockFetch(jsonResponse(await loadFixture()))

    await semanticScholarAdapter.fetch({ since: SINCE, now: NOW, apiKey: null, throttleMs: 0 })

    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>
    expect(headers['x-api-key']).toBeUndefined()
  })
})

describe('semanticScholarAdapter.fetch — pagination', () => {
  afterEach(() => vi.restoreAllMocks())

  it('follows the continuation token and stops when it is absent', async () => {
    const fixture = await loadFixture()
    const page1 = { ...fixture, token: 'CONTINUE_ME' }
    const page2 = { ...fixture, token: null }

    const fetchSpy = mockFetch(jsonResponse(page1), jsonResponse(page2))

    await semanticScholarAdapter.fetch({
      since: SINCE,
      now: NOW,
      apiKey: 'k',
      throttleMs: 0,
      queries: ['image forgery detection'],
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(requestUrl(fetchSpy.mock.calls[0]).searchParams.get('token')).toBeNull()
    expect(requestUrl(fetchSpy.mock.calls[1]).searchParams.get('token')).toBe('CONTINUE_ME')
  })

  it('stops paging at the safety cap even if the token never clears', async () => {
    const fixture = await loadFixture()
    const fetchSpy = mockFetch(jsonResponse({ ...fixture, token: 'NEVER_ENDS' }))

    await semanticScholarAdapter.fetch({
      since: SINCE,
      now: NOW,
      apiKey: 'k',
      throttleMs: 0,
      queries: ['image forgery detection'],
    })

    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(10)
  })
})

describe('semanticScholarAdapter.fetch — resilience', () => {
  afterEach(() => vi.restoreAllMocks())

  it('retries a 429 with backoff and succeeds on a later attempt', async () => {
    const fetchSpy = mockFetch(jsonResponse({ message: 'Too Many Requests' }, 429), jsonResponse({ message: 'Too Many Requests' }, 429), jsonResponse(await loadFixture()))

    const papers = await semanticScholarAdapter.fetch({
      since: SINCE,
      now: NOW,
      apiKey: 'k',
      throttleMs: 0,
      queries: ['image forgery detection'],
    })

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(papers.length).toBeGreaterThan(0)
  })

  it('keeps results from healthy queries when one query exhausts its retries', async () => {
    const fixture = await loadFixture()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input))
      if (url.searchParams.get('query') === 'poisoned') {
        return jsonResponse({ message: 'nope' }, 429)()
      }
      return jsonResponse(fixture)()
    })

    const papers = await semanticScholarAdapter.fetch({
      since: SINCE,
      now: NOW,
      apiKey: 'k',
      throttleMs: 0,
      queries: ['poisoned', 'image forgery detection'],
    })

    expect(papers.length).toBeGreaterThan(0)
    expect(fetchSpy).toHaveBeenCalled()
  })

  it('throws only when every query fails', async () => {
    mockFetch(jsonResponse({ message: 'boom' }, 500))

    await expect(
      semanticScholarAdapter.fetch({ since: SINCE, now: NOW, apiKey: 'k', throttleMs: 0 }),
    ).rejects.toThrow(/Semantic Scholar/i)
  })

  it('dedupes the same paper returned by multiple keyword queries', async () => {
    const fixture = await loadFixture()
    mockFetch(jsonResponse(fixture))

    const papers = await semanticScholarAdapter.fetch({
      since: SINCE,
      now: NOW,
      apiKey: 'k',
      throttleMs: 0,
      queries: ['a', 'b', 'c'],
    })

    const keys = papers.map((p) => p.arxivId ?? p.doi ?? p.title)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('still drops anything older than since if the server ignores the date filter', async () => {
    mockFetch(
      jsonResponse({
        data: [
          { title: 'ancient', publicationDate: '2018-03-01', year: 2018 },
          { title: 'fresh', publicationDate: '2026-08-08', year: 2026 },
        ],
      }),
    )

    const papers = await semanticScholarAdapter.fetch({
      since: SINCE,
      now: NOW,
      apiKey: 'k',
      throttleMs: 0,
      queries: ['image forgery detection'],
    })

    expect(papers.map((p) => p.title)).toEqual(['fresh'])
  })
})
