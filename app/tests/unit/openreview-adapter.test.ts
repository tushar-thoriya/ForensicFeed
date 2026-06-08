// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openReviewAdapter, parseOpenReviewSearch } from '@/lib/ingestion/adapters/openreview'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/openreview-notes.json')

async function loadFixture(): Promise<unknown> {
  const raw = await readFile(fixturePath, 'utf8')
  return JSON.parse(raw)
}

describe('parseOpenReviewSearch', () => {
  it('parses notes into NormalisedPaper[] with absolute pdf URLs', async () => {
    const json = await loadFixture()
    const papers = parseOpenReviewSearch(json, ['ICLR.cc/', 'NeurIPS.cc/'])

    // 4 ICLR/NeurIPS forgery-relevant; 1 withdrawn (skipped); 1 archive (filtered by domain).
    // Withdrawn ICLR.cc/2026/... is dropped because venueid contains 'Withdrawn'.
    expect(papers).toHaveLength(4)

    for (const paper of papers) {
      expect(paper.pdfUrl).toMatch(/^https:\/\/openreview\.net\/pdf\//)
      expect(paper.primarySource).toBe('openreview')
      expect(paper.venueType).toBe('conference')
    }
  })

  it('extracts code URL from abstract via extractCodeUrl', async () => {
    const json = await loadFixture()
    const papers = parseOpenReviewSearch(json, ['ICLR.cc/', 'NeurIPS.cc/'])
    const freqPaper = papers.find((p) => p.title.includes('Frequency'))
    expect(freqPaper?.codeUrl).toBe('https://github.com/example/freq-deepfake')
  })

  it('uses cdate (ms epoch) as publishedDate', async () => {
    const json = await loadFixture()
    const papers = parseOpenReviewSearch(json, ['ICLR.cc/', 'NeurIPS.cc/'])
    const freqPaper = papers.find((p) => p.title.includes('Frequency'))
    expect(freqPaper?.publishedDate.getTime()).toBe(1727740800000)
  })

  it('falls back gracefully when abstract is missing', async () => {
    const json = await loadFixture()
    const papers = parseOpenReviewSearch(json, ['ICLR.cc/', 'NeurIPS.cc/'])
    const noAbstract = papers.find((p) => p.title.includes('Tampering Detection without Abstract'))
    expect(noAbstract).toBeDefined()
    expect(noAbstract?.abstract).toBeNull()
    expect(noAbstract?.codeUrl).toBeNull()
  })

  it('filters notes by venue prefix list', async () => {
    const json = await loadFixture()

    const iclrOnly = parseOpenReviewSearch(json, ['ICLR.cc/'])
    expect(iclrOnly.every((p) => p.venue?.startsWith('ICLR') === true)).toBe(true)

    const neuripsOnly = parseOpenReviewSearch(json, ['NeurIPS.cc/'])
    expect(neuripsOnly.every((p) => p.venue?.startsWith('NeurIPS') === true)).toBe(true)
    expect(neuripsOnly.length).toBe(1)
  })

  it('skips withdrawn submissions', async () => {
    const json = await loadFixture()
    const papers = parseOpenReviewSearch(json, ['ICLR.cc/', 'NeurIPS.cc/'])
    expect(papers.find((p) => p.title.includes('Withdrawn'))).toBeUndefined()
  })

  it('sets venue label like "ICLR 2025" from venueid path', async () => {
    const json = await loadFixture()
    const papers = parseOpenReviewSearch(json, ['ICLR.cc/', 'NeurIPS.cc/'])
    const freqPaper = papers.find((p) => p.title.includes('Frequency'))
    expect(freqPaper?.venue).toBe('ICLR 2025')
    expect(freqPaper?.year).toBe(2025)
  })

  it('returns empty array on malformed input', () => {
    expect(parseOpenReviewSearch(null, ['ICLR.cc/'])).toEqual([])
    expect(parseOpenReviewSearch({ notes: 'not an array' }, ['ICLR.cc/'])).toEqual([])
    expect(parseOpenReviewSearch({}, ['ICLR.cc/'])).toEqual([])
  })

  it('skips notes missing pdf, title, or domain', () => {
    const synthetic = {
      notes: [
        { id: '1', domain: 'ICLR.cc/2025/Conference', content: { title: { value: 't' } } }, // no pdf
        {
          id: '2',
          domain: 'ICLR.cc/2025/Conference',
          content: { pdf: { value: '/pdf/x.pdf' } },
        }, // no title
        {
          id: '3',
          content: {
            title: { value: 'forgery' },
            pdf: { value: '/pdf/x.pdf' },
            venueid: { value: 'ICLR.cc/2025/Conference' },
          },
        }, // no domain
      ],
    }
    expect(parseOpenReviewSearch(synthetic, ['ICLR.cc/'])).toEqual([])
  })
})

describe('openReviewAdapter.fetch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('queries the OR API and applies the since filter', async () => {
    const json = await loadFixture()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(json), { status: 200 }))

    const papers = await openReviewAdapter.fetch({
      since: new Date('2024-09-01T00:00:00Z'),
      now: new Date('2024-12-01T00:00:00Z'),
      venues: ['ICLR.cc/', 'NeurIPS.cc/'],
    })

    expect(fetchSpy).toHaveBeenCalled()
    const firstCallUrl = String(fetchSpy.mock.calls[0]?.[0])
    expect(firstCallUrl).toContain('api2.openreview.net/notes/search')
    expect(firstCallUrl).toContain('type=terms')

    // NeurIPS paper from 2024-06-01 is filtered out by since=2024-09-01.
    expect(papers.every((p) => p.publishedDate >= new Date('2024-09-01T00:00:00Z'))).toBe(true)
  })

  it('dedupes the same note across multiple keyword queries', async () => {
    const json = await loadFixture()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify(json), { status: 200 }),
    )

    const papers = await openReviewAdapter.fetch({
      since: new Date('2020-01-01T00:00:00Z'),
      now: new Date('2024-12-01T00:00:00Z'),
      venues: ['ICLR.cc/', 'NeurIPS.cc/'],
    })

    const ids = papers.map((p) => p.rawMetadata?.openreviewId)
    const uniqueIds = new Set(ids)
    expect(ids.length).toBe(uniqueIds.size)
  })

  it('throws when every keyword query fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 503 }))
    await expect(
      openReviewAdapter.fetch({
        since: new Date('2020-01-01T00:00:00Z'),
        now: new Date('2024-12-01T00:00:00Z'),
        venues: ['ICLR.cc/'],
      }),
    ).rejects.toThrow(/OpenReview/i)
  })

  it('isolates per-keyword failures', async () => {
    const json = await loadFixture()
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount += 1
      if (callCount === 1) return new Response('first fail', { status: 500 })
      return new Response(JSON.stringify(json), { status: 200 })
    })

    const papers = await openReviewAdapter.fetch({
      since: new Date('2020-01-01T00:00:00Z'),
      now: new Date('2024-12-01T00:00:00Z'),
      venues: ['ICLR.cc/', 'NeurIPS.cc/'],
    })

    expect(papers.length).toBeGreaterThan(0)
  })
})
