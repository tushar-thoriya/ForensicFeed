// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { huggingfaceAdapter, parseHuggingFaceSearch } from '@/lib/ingestion/adapters/huggingface'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/huggingface-papers.json')

async function loadFixture(): Promise<unknown> {
  const raw = await readFile(fixturePath, 'utf8')
  return JSON.parse(raw)
}

describe('parseHuggingFaceSearch', () => {
  it('parses a real HF Papers response into NormalisedPaper[]', async () => {
    const json = await loadFixture()
    const papers = parseHuggingFaceSearch(json)
    expect(papers).toHaveLength(3)

    const first = papers[0]!
    expect(first.arxivId).toBe('2604.01234')
    expect(first.primarySource).toBe('huggingface')
    expect(first.venue).toBe('arXiv')
    expect(first.publishedDate.toISOString()).toBe('2026-04-15T00:00:00.000Z')
    expect(first.year).toBe(2026)
    expect(first.pdfUrl).toBe('https://arxiv.org/pdf/2604.01234')
    expect(first.authors.length).toBeGreaterThan(0)
    expect(first.codeUrl).toBe('https://github.com/example/forgery-detect')
  })

  it('returns empty array for malformed payload', () => {
    expect(parseHuggingFaceSearch(null)).toEqual([])
    expect(parseHuggingFaceSearch({ data: 'not an array' })).toEqual([])
  })

  it('skips entries missing arxivId, title, or publishedAt', () => {
    const synthetic = [
      { paper: { title: 'no id', summary: 's', publishedAt: '2026-04-15' } },
      { paper: { id: '2604.0001', summary: 's', publishedAt: '2026-04-15' } },
      {
        paper: { id: '2604.0002', title: 't', summary: 's', publishedAt: 'not-a-date' },
      },
      {
        paper: {
          id: '2604.0003',
          title: 'good',
          summary: 's',
          publishedAt: '2026-04-15T00:00:00Z',
          authors: [{ name: 'A' }],
        },
      },
    ]
    const papers = parseHuggingFaceSearch(synthetic)
    expect(papers).toHaveLength(1)
    expect(papers[0]!.arxivId).toBe('2604.0003')
  })
})

describe('huggingfaceAdapter.fetch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('queries HF API and applies the since filter', async () => {
    const json = await loadFixture()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(json), { status: 200 }))

    const papers = await huggingfaceAdapter.fetch({
      since: new Date('2026-04-01T00:00:00Z'),
      now: new Date('2026-04-25T10:00:00Z'),
    })

    // The 2026-03-01 fixture entry is filtered by `since`.
    expect(papers.map((p) => p.arxivId).sort()).toEqual(['2604.01234', '2604.05678'])
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0)
    const firstCallUrl = String(fetchSpy.mock.calls[0]?.[0])
    expect(firstCallUrl).toContain('huggingface.co/api/papers/search')
  })

  it('dedupes the same arxivId across multiple keyword queries', async () => {
    const json = await loadFixture()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(json), { status: 200 }),
    )

    const papers = await huggingfaceAdapter.fetch({
      since: new Date('2026-01-01T00:00:00Z'),
      now: new Date('2026-04-25T10:00:00Z'),
    })

    const ids = papers.map((p) => p.arxivId)
    const uniqueIds = new Set(ids)
    expect(ids.length).toBe(uniqueIds.size)
  })

  it('throws if every keyword query fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 503 }))
    await expect(
      huggingfaceAdapter.fetch({
        since: new Date('2026-01-01T00:00:00Z'),
        now: new Date('2026-04-25T10:00:00Z'),
      }),
    ).rejects.toThrow(/Hugging Face/i)
  })
})
