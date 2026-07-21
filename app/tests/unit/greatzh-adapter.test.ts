// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { greatzhAdapter, parseGreatzhReadme } from '@/lib/ingestion/adapters/greatzh'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/greatzh-readme.md')

async function loadFixture(): Promise<string> {
  return readFile(fixturePath, 'utf8')
}

describe('parseGreatzhReadme', () => {
  it('extracts papers from forgery and deepfake categories, skipping out-of-scope ones', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)

    // 7 forgery-section papers (with arXiv ids) + Face Forgery (2601.12111)
    // + Video Forgery (2602.55555), both deepfake-domain. Backbone and Object
    // Detection remain out of scope; 2 allowed-section entries lack an arXiv id.
    expect(papers).toHaveLength(9)
    const titles = papers.map((p) => p.title)
    expect(titles).not.toContain('Attention Is All You Need')
    expect(titles).not.toContain('A generic object detector survey')
  })

  it('tags forgery-section papers with a forgery domainHint', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const splicing = papers.find((p) => p.arxivId === '2602.10079')
    const document = papers.find((p) => p.arxivId === '2405.11223')
    expect(splicing?.domainHint).toBe('forgery')
    expect(document?.domainHint).toBe('forgery')
  })

  it('tags Face Forgery and Video Forgery section papers with a deepfake domainHint', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const faceForgery = papers.find((p) => p.arxivId === '2601.12111')
    const videoForgery = papers.find((p) => p.arxivId === '2602.55555')
    expect(faceForgery?.title).toBe(
      'RCDN: Real-Centered Detection Network for Robust Face Forgery Identification',
    )
    expect(faceForgery?.domainHint).toBe('deepfake')
    expect(videoForgery?.domainHint).toBe('deepfake')
  })

  it('skips entries with no extractable arXiv id, even inside an allowed section', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const titles = papers.map((p) => p.title)
    expect(titles).not.toContain(
      'No Pixel Left Behind: A Detail-Preserving Architecture for Robust High-Resolution AI-Generated Image Detection',
    )
    expect(titles).not.toContain(
      'Image Splicing Localization via Semi-global Network and Fully Connected Conditional Random Fields',
    )
  })

  it('extracts title, arXiv id, and code URL from a modern shields.io badge entry', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const paper = papers.find((p) => p.arxivId === '2603.12930')
    expect(paper?.title).toBe('Rethinking VLMs for Image Forgery Detection and Localization')
    expect(paper?.codeUrl).toBe('https://github.com/sha0fengGuo/IFDL-VLM')
    expect(paper?.venue).toBe('arXiv')
    expect(paper?.venueType).toBe('arxiv')
    expect(paper?.pdfUrl).toBe('https://arxiv.org/pdf/2603.12930')
    expect(paper?.publishedDate).toEqual(new Date(Date.UTC(2026, 2, 1)))
    expect(paper?.year).toBe(2026)
  })

  it('handles the %27-encoded apostrophe variant of the venue badge', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const paper = papers.find((p) => p.arxivId === '2602.10079')
    expect(paper?.title).toMatch(/^Can Image Splicing and Copy-Move Forgery/)
    expect(paper?.venue).toBe('arXiv')
    expect(paper?.codeUrl).toBeNull()
  })

  it('resolves a real conference venue label from a badge with a named venue', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const paper = papers.find((p) => p.arxivId === '2410.02761')
    expect(paper?.title).toBe(
      'FakeShield: Explainable Image Forgery Detection and Localization via Multi-modal Large Language Models',
    )
    expect(paper?.venue).toBe('ICLR 2025')
    expect(paper?.venueType).toBe('conference')
    expect(paper?.codeUrl).toBe('https://github.com/zhipeixu/FakeShield')
    // Trailing "*❗Updated*" annotation must not leak into the title.
    expect(paper?.title).not.toMatch(/Updated/)
  })

  it('extracts title from a legacy doc-linked entry, not the .md path', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const paper = papers.find((p) => p.arxivId === '2201.09099')
    expect(paper?.title).toBe('Multi-Task SE-Network for Image Splicing Localization')
    expect(paper?.venue).toBe('TCSVT 2022')
    expect(paper?.venueType).toBe('journal')
    expect(paper?.codeUrl).toBe(
      'https://github.com/YulansZhang/Multi-task-SE-Network-for-Image-Splicing-Localization',
    )
    expect(paper?.publishedDate).toEqual(new Date(Date.UTC(2022, 0, 1)))
  })

  it('extracts title from a legacy plain-text entry with no code link', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const paper = papers.find((p) => p.arxivId === '2206.10737')
    expect(paper?.title).toBe(
      'Deep Metric Color Embeddings for Splicing Localization in Severely Degraded Images',
    )
    expect(paper?.venue).toBe('TIFS 2022')
    expect(paper?.venueType).toBe('journal')
    expect(paper?.codeUrl).toBeNull()
  })

  it('derives year and month from the arXiv id itself (YYMM prefix)', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const paper = papers.find((p) => p.arxivId === '2405.11223')
    expect(paper?.year).toBe(2024)
    expect(paper?.publishedDate).toEqual(new Date(Date.UTC(2024, 4, 1)))
  })

  it('sets shared fields consistently across every parsed paper', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    for (const paper of papers) {
      expect(paper.primarySource).toBe('greatzh')
      expect(paper.authors).toEqual([])
      expect(paper.abstract).toBeNull()
      expect(paper.doi).toBeNull()
      expect(paper.citationCount).toBeNull()
    }
  })

  it('falls back to a bare "arXiv" venue when no badge or parenthetical venue marker is present', async () => {
    const markdown = await loadFixture()
    const papers = parseGreatzhReadme(markdown)
    const paper = papers.find((p) => p.arxivId === '2311.08765')
    expect(paper?.title).toBe('Bare Arxiv Link Entry With No Venue Marker')
    expect(paper?.venue).toBe('arXiv')
    expect(paper?.venueType).toBe('arxiv')
  })

  it('returns an empty array for empty or malformed markdown', () => {
    expect(parseGreatzhReadme('')).toEqual([])
    expect(parseGreatzhReadme('# just a title\n\nno bullets here')).toEqual([])
  })

  it('inherits allowed state for a non-allowlisted subheading nested under an allowed section', () => {
    const markdown = `
### Image Splicing

#### Some Themed Subcategory Not In The Allowlist

* [ ] Nested Themed Entry [![Static Badge](https://img.shields.io/badge/arXiv_'24-6c757d)](https://arxiv.org/abs/2401.00001)

### Backbone

* [ ] Sibling Not Nested [![Static Badge](https://img.shields.io/badge/arXiv_'24-6c757d)](https://arxiv.org/abs/2401.00002)
`
    const papers = parseGreatzhReadme(markdown)
    expect(papers.some((p) => p.arxivId === '2401.00001')).toBe(true)
    expect(papers.some((p) => p.arxivId === '2401.00002')).toBe(false)
  })
})

describe('greatzhAdapter.fetch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ignores the since filter — publishedDate is only month-granular, so a rolling cutoff would permanently drop late-added papers', async () => {
    // dateFromArxivId pins publishedDate to the 1st of the arXiv month. If
    // fetch filtered by `since`, a paper added to the curated list weeks
    // after its arXiv month would fall outside every future weekly cutoff
    // and never recover. Full sweep + DB upsert dedup (like cvf.ts) avoids
    // that permanently-lost-paper failure mode.
    const markdown = await loadFixture()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(markdown, { status: 200 }))

    const papers = await greatzhAdapter.fetch({
      since: new Date(Date.UTC(2099, 0, 1)),
      now: new Date(Date.UTC(2026, 6, 1)),
    })

    expect(papers.some((p) => p.arxivId === '2603.12930')).toBe(true)
    expect(papers.some((p) => p.arxivId === '2201.09099')).toBe(true)
    expect(papers.length).toBeGreaterThan(0)
  })

  it('throws a descriptive error when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }))
    await expect(
      greatzhAdapter.fetch({ since: new Date(0), now: new Date() }),
    ).rejects.toThrow(/greatzh/i)
  })

  it('times out and throws a descriptive error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        }),
    )
    await expect(
      greatzhAdapter.fetch({ since: new Date(0), now: new Date() }),
    ).rejects.toThrow(/timed out/i)
  })
})
