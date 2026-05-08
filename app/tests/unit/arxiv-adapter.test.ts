// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { arxivAdapter, parseArxivAtom } from '@/lib/ingestion/adapters/arxiv'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/arxiv-feed.xml')

async function loadFixture(): Promise<string> {
  return readFile(fixturePath, 'utf8')
}

describe('parseArxivAtom', () => {
  it('parses Atom entries into NormalisedPaper[]', async () => {
    const xml = await loadFixture()
    const papers = parseArxivAtom(xml)

    expect(papers).toHaveLength(2)
    const first = papers[0]!
    const second = papers[1]!

    expect(first.arxivId).toBe('2604.01234')
    expect(first.title).toBe('Localizing Copy-Move Forgery in Passport Document Images')
    expect(first.authors).toEqual(['Alice Example', 'Bob Sample'])
    expect(first.abstract).toContain('copy-move forgery localization')
    expect(first.doi).toBe('10.1109/FAKE.2026.01234')
    expect(first.pdfUrl).toBe('http://arxiv.org/pdf/2604.01234v1.pdf')
    expect(first.publishedDate.toISOString()).toBe('2026-04-15T12:00:00.000Z')
    expect(first.updatedDate?.toISOString()).toBe('2026-04-18T09:00:00.000Z')
    expect(first.primarySource).toBe('arxiv')
    expect(first.venueType).toBe('arxiv')
    expect(first.year).toBe(2026)

    expect(second.arxivId).toBe('2604.05678')
    expect(second.doi).toBeNull()
  })

  it('collapses whitespace inside abstracts', async () => {
    const xml = await loadFixture()
    const papers = parseArxivAtom(xml)
    expect(papers[0]?.abstract).not.toMatch(/\n/)
    expect(papers[0]?.abstract?.startsWith(' ')).toBe(false)
  })

  it('returns an empty array when the feed has no entries', () => {
    const xml =
      '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>empty</title></feed>'
    expect(parseArxivAtom(xml)).toEqual([])
  })
})

describe('arxivAdapter.fetch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('queries arXiv API and maps results to NormalisedPaper[]', async () => {
    const xml = await loadFixture()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(xml, { status: 200 }))

    const papers = await arxivAdapter.fetch({
      since: new Date('2026-01-01T00:00:00Z'),
      now: new Date('2026-04-19T10:00:00Z'),
      maxResults: 100,
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const urlArg = fetchSpy.mock.calls[0]?.[0]
    const urlStr = urlArg instanceof URL ? urlArg.toString() : String(urlArg)
    expect(urlStr).toContain('export.arxiv.org/api/query')
    expect(urlStr).toMatch(/cat:cs\.CV/)
    expect(urlStr).toMatch(/sortBy=submittedDate/)
    expect(papers).toHaveLength(2)
  })

  it('filters out papers older than the `since` cutoff', async () => {
    const xml = await loadFixture()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(xml, { status: 200 }))

    const papers = await arxivAdapter.fetch({
      since: new Date('2026-04-05T00:00:00Z'),
      now: new Date('2026-04-19T10:00:00Z'),
      maxResults: 100,
    })

    expect(papers).toHaveLength(1)
    expect(papers[0]?.arxivId).toBe('2604.01234')
  })

  it('throws with status code when arXiv returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('service unavailable', { status: 503 }),
    )
    await expect(
      arxivAdapter.fetch({
        since: new Date('2026-01-01T00:00:00Z'),
        now: new Date('2026-04-19T10:00:00Z'),
      }),
    ).rejects.toThrow(/503/)
  })
})
