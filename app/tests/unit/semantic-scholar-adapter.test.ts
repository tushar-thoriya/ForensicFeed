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
const fixturePath = resolve(here, '../fixtures/semantic-scholar.json')

async function loadFixture(): Promise<unknown> {
  const raw = await readFile(fixturePath, 'utf8')
  return JSON.parse(raw)
}

describe('parseSemanticScholarSearch', () => {
  it('parses an S2 paper/search response into NormalisedPaper[]', async () => {
    const json = await loadFixture()
    const papers = parseSemanticScholarSearch(json)
    expect(papers).toHaveLength(3)

    const first = papers[0]!
    expect(first.title).toBe('Localizing Copy-Move Forgery in Passport Document Images')
    expect(first.arxivId).toBe('2604.01234')
    expect(first.doi).toBe('10.1109/FAKE.2026.01234')
    expect(first.citationCount).toBe(7)
    expect(first.codeUrl).toBe('https://github.com/lab-org/passport-forgery')
    expect(first.pdfUrl).toBe('https://arxiv.org/pdf/2604.01234.pdf')
    expect(first.publishedDate.toISOString()).toBe('2026-04-15T00:00:00.000Z')
    expect(first.primarySource).toBe('semantic_scholar')
    expect(first.venueType).toBe('arxiv')

    const second = papers[1]!
    expect(second.arxivId).toBeNull()
    expect(second.doi).toBe('10.1145/MM.2026.05678')
    expect(second.venueType).toBe('preprint')
    expect(second.citationCount).toBe(0)

    const third = papers[2]!
    expect(third.arxivId).toBeNull()
    expect(third.doi).toBeNull()
    // Falls back to year-only when publicationDate is the day-precision string.
    expect(third.publishedDate.toISOString()).toBe('2018-03-01T00:00:00.000Z')
    expect(third.citationCount).toBe(312)
  })

  it('returns empty array for malformed payload', () => {
    expect(parseSemanticScholarSearch(null)).toEqual([])
    expect(parseSemanticScholarSearch({ data: 'not an array' })).toEqual([])
    expect(parseSemanticScholarSearch({})).toEqual([])
  })

  it('skips entries with no usable date or title', () => {
    const synthetic = {
      data: [
        { title: null, publicationDate: '2026-04-15' },
        { title: 'no date', publicationDate: null, year: null },
        { title: 'good', publicationDate: '2026-04-15', authors: [] },
      ],
    }
    const papers = parseSemanticScholarSearch(synthetic)
    expect(papers).toHaveLength(1)
    expect(papers[0]!.title).toBe('good')
  })
})

describe('semanticScholarAdapter.fetch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passes the API key as x-api-key header when provided', async () => {
    const json = await loadFixture()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(json), { status: 200 }))

    await semanticScholarAdapter.fetch({
      since: new Date('2026-01-01T00:00:00Z'),
      now: new Date('2026-04-25T10:00:00Z'),
      apiKey: 'test-key-abc',
    })

    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>
    expect(headers['x-api-key']).toBe('test-key-abc')
  })

  it('omits x-api-key header when no key is provided', async () => {
    const json = await loadFixture()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(json), { status: 200 }))

    await semanticScholarAdapter.fetch({
      since: new Date('2026-01-01T00:00:00Z'),
      now: new Date('2026-04-25T10:00:00Z'),
      apiKey: null,
    })

    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>
    expect(headers['x-api-key']).toBeUndefined()
  })

  it('filters by since across keyword queries and dedupes', async () => {
    const json = await loadFixture()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(json), { status: 200 }),
    )

    const papers = await semanticScholarAdapter.fetch({
      since: new Date('2026-04-01T00:00:00Z'),
      now: new Date('2026-04-25T10:00:00Z'),
      apiKey: 'test-key',
    })

    // 2018 fixture entry filtered out by since.
    expect(papers.map((p) => p.title)).toContain(
      'Localizing Copy-Move Forgery in Passport Document Images',
    )
    expect(
      papers.map((p) => p.title).includes('Old Survey on Image Forensics'),
    ).toBe(false)
    // Dedup across keyword queries: each fixture paper appears at most once.
    const titles = papers.map((p) => p.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('throws when every keyword query fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    )
    await expect(
      semanticScholarAdapter.fetch({
        since: new Date('2026-01-01T00:00:00Z'),
        now: new Date('2026-04-25T10:00:00Z'),
        apiKey: 'test-key',
      }),
    ).rejects.toThrow(/Semantic Scholar/i)
  })
})
