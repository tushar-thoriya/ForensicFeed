// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cvfAdapter, parseCvfHtml } from '@/lib/ingestion/adapters/cvf'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/cvf-proceedings.html')

async function loadFixture(): Promise<string> {
  return readFile(fixturePath, 'utf8')
}

describe('parseCvfHtml', () => {
  it('extracts only forgery-relevant papers from a proceedings page', async () => {
    const html = await loadFixture()
    const papers = parseCvfHtml(html, 'CVPR2024')

    // Fixture has 6 papers, 2 are forgery-relevant.
    expect(papers).toHaveLength(2)
    const titles = papers.map((p) => p.title).sort()
    expect(titles[0]).toMatch(/Image Manipulation Localization/)
    expect(titles[1]).toMatch(/Universal Deepfake Detection/)
  })

  it('extracts arXiv ID when the [arXiv] link is present', async () => {
    const html = await loadFixture()
    const papers = parseCvfHtml(html, 'CVPR2024')
    const deepfake = papers.find((p) => p.title.includes('Deepfake'))
    expect(deepfake?.arxivId).toBe('2403.12345')
  })

  it('leaves arxivId null when no [arXiv] link is present', async () => {
    const html = await loadFixture()
    const papers = parseCvfHtml(html, 'CVPR2024')
    const localization = papers.find((p) => p.title.includes('Manipulation Localization'))
    expect(localization?.arxivId).toBeNull()
  })

  it('resolves relative pdf hrefs to absolute openaccess.thecvf.com URLs', async () => {
    const html = await loadFixture()
    const papers = parseCvfHtml(html, 'CVPR2024')
    for (const paper of papers) {
      expect(paper.pdfUrl).toMatch(
        /^https:\/\/openaccess\.thecvf\.com\/content\/CVPR2024\/papers\//,
      )
    }
  })

  it('extracts authors from the authsearch hidden inputs', async () => {
    const html = await loadFixture()
    const papers = parseCvfHtml(html, 'CVPR2024')
    const deepfake = papers.find((p) => p.title.includes('Deepfake'))
    expect(deepfake?.authors).toEqual(['John Smith', 'Alice Wong', 'Bao Liu'])
  })

  it('sets venue label from the venue code (e.g. CVPR2024 → "CVPR 2024")', async () => {
    const html = await loadFixture()
    const papers = parseCvfHtml(html, 'CVPR2024')
    for (const paper of papers) {
      expect(paper.venue).toBe('CVPR 2024')
      expect(paper.venueType).toBe('conference')
      expect(paper.year).toBe(2024)
      expect(paper.primarySource).toBe('cvf')
    }
  })

  it('handles ICCV venue codes', () => {
    const html = `<dl>
      <dt class="ptitle"><a href="/content/ICCV2023/html/x.html">Forgery localization study</a></dt>
      <dd>
        <form class="authsearch"><input type="hidden" name="query_author" value="A"></form>
      </dd>
      <dd>[<a href="/content/ICCV2023/papers/x.pdf">pdf</a>]</dd>
    </dl>`
    const papers = parseCvfHtml(html, 'ICCV2023')
    expect(papers[0]?.venue).toBe('ICCV 2023')
    expect(papers[0]?.year).toBe(2023)
  })

  it('returns empty array for empty or malformed HTML', () => {
    expect(parseCvfHtml('', 'CVPR2024')).toEqual([])
    expect(parseCvfHtml('<html><body><p>nothing here</p></body></html>', 'CVPR2024')).toEqual([])
  })

  it('skips papers missing a pdf link', () => {
    const html = `<dl>
      <dt class="ptitle"><a href="/content/CVPR2024/html/x.html">Image Forgery Detection without PDF</a></dt>
      <dd><form class="authsearch"><input type="hidden" name="query_author" value="A"></form></dd>
      <dd>[<a class="fakelink">bibtex</a>]</dd>
    </dl>`
    expect(parseCvfHtml(html, 'CVPR2024')).toEqual([])
  })
})

describe('cvfAdapter.fetch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetches each configured venue and merges results', async () => {
    const html = await loadFixture()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(html, { status: 200 }))

    const papers = await cvfAdapter.fetch({
      since: new Date('2020-01-01T00:00:00Z'),
      now: new Date('2024-12-01T00:00:00Z'),
      venues: ['CVPR2024', 'ICCV2023'],
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    // Both venues return the same fixture, so dedup by title-hash should keep
    // both venue versions as separate rows (different `venue` field).
    expect(papers.length).toBeGreaterThanOrEqual(2)
    const venues = new Set(papers.map((p) => p.venue))
    expect(venues.has('CVPR 2024')).toBe(true)
    expect(venues.has('ICCV 2023')).toBe(true)
  })

  it('ignores the since filter — proceedings are static and DB dedup is the source of truth', async () => {
    // CVF proceedings never gain new papers after the conference, so a
    // since-based cutoff would silently drop every paper from every weekly
    // run. The adapter therefore always returns the full sweep; the upsert
    // layer handles idempotency.
    const html = await loadFixture()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }))

    const papers = await cvfAdapter.fetch({
      since: new Date('2099-01-01T00:00:00Z'),
      now: new Date('2025-12-01T00:00:00Z'),
      venues: ['CVPR2024'],
    })

    expect(papers.length).toBeGreaterThan(0)
  })

  it('isolates per-venue failures: returns successful venues when one fails', async () => {
    const html = await loadFixture()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => new Response('server error', { status: 500 }))
      .mockImplementationOnce(async () => new Response(html, { status: 200 }))

    const papers = await cvfAdapter.fetch({
      since: new Date('2020-01-01T00:00:00Z'),
      now: new Date('2024-12-01T00:00:00Z'),
      venues: ['CVPR2024', 'ICCV2023'],
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(papers.length).toBeGreaterThan(0)
    expect(papers.every((p) => p.venue === 'ICCV 2023')).toBe(true)
  })

  it('throws when every venue fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }))
    await expect(
      cvfAdapter.fetch({
        since: new Date('2020-01-01T00:00:00Z'),
        now: new Date('2024-12-01T00:00:00Z'),
        venues: ['CVPR2024', 'ICCV2023'],
      }),
    ).rejects.toThrow(/CVF/i)
  })
})
