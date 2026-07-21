// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DIGEST_FULL_CARDS,
  escapeHtml,
  renderDigestEmail,
  type RenderDigestInput,
} from '@/lib/email/digest-template'
import type { DigestPaper } from '@/lib/db/queries/digest-query'

const WEEK_START = new Date('2026-06-02T00:00:00Z')
const WEEK_END = new Date('2026-06-09T00:00:00Z')
const APP_URL = 'https://forensicfeed.example.com'

function paper(overrides: Partial<DigestPaper> = {}): DigestPaper {
  return {
    id: 'arxiv:2406.00001',
    title: 'Robust Image Splicing Localization',
    authors: ['Zhang', 'Li', 'Kumar'],
    venue: 'CVPR',
    venueType: 'conference',
    relevanceScore: 0.94,
    relevanceTags: ['splicing', 'localization'],
    pdfUrl: 'https://arxiv.org/pdf/2406.00001',
    arxivId: '2406.00001',
    publishedDate: new Date('2026-06-05T00:00:00Z'),
    createdAt: new Date('2026-06-06T00:00:00Z'),
    primarySource: 'arxiv',
    rawMetadata: {},
    ...overrides,
  }
}

function render(papers: DigestPaper[], extra: Partial<RenderDigestInput> = {}) {
  return renderDigestEmail({
    papers,
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    appUrl: APP_URL,
    ...extra,
  })
}

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml('A <b>& "x" \'y\'</b>')).toBe(
      'A &lt;b&gt;&amp; &quot;x&quot; &#39;y&#39;&lt;/b&gt;',
    )
  })

  it('escapes & before other entities (no double-encoding artifacts)', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('renderDigestEmail — subject', () => {
  it('uses singular for one paper', () => {
    expect(render([paper()]).subject).toMatch(/1 new paper\b/)
  })

  it('uses plural for multiple papers', () => {
    expect(render([paper(), paper({ id: 'b' })]).subject).toMatch(/2 new papers\b/)
  })

  it('signals a quiet week when empty', () => {
    expect(render([]).subject).toMatch(/quiet week/i)
  })
})

describe('renderDigestEmail — content', () => {
  it('includes every paper title in html and text', () => {
    const papers = [
      paper({ id: 'a', title: 'Alpha Forgery Net' }),
      paper({ id: 'b', title: 'Beta Diffusion Detect' }),
    ]
    const { html, text } = render(papers)
    for (const p of papers) {
      expect(html).toContain(p.title)
      expect(text).toContain(p.title)
    }
  })

  it('links the title to the in-app detail page', () => {
    const { html } = render([paper({ id: 'arxiv:2406.00001' })])
    expect(html).toContain(`${APP_URL}/papers/arxiv%3A2406.00001`)
  })

  it('prefers pdfUrl for the external link', () => {
    const { html } = render([paper({ pdfUrl: 'https://example.com/p.pdf', arxivId: '2406.00001' })])
    expect(html).toContain('https://example.com/p.pdf')
  })

  it('falls back to arxiv abs url when no pdfUrl', () => {
    const { html } = render([paper({ pdfUrl: null, arxivId: '2406.00001' })])
    expect(html).toContain('https://arxiv.org/abs/2406.00001')
  })

  it('omits the external link gracefully when no pdfUrl and no arxivId', () => {
    const { html } = render([paper({ pdfUrl: null, arxivId: null })])
    expect(html).toContain('Robust Image Splicing Localization')
    expect(html).not.toContain('arxiv.org/abs')
  })

  it('truncates author lists beyond three with "et al."', () => {
    const { html } = render([paper({ authors: ['A', 'B', 'C', 'D', 'E'] })])
    expect(html).toMatch(/A, B, C\s*et al\./)
  })
})

describe('renderDigestEmail — greatzh source badge', () => {
  it('links back to the greatzh/papers GitHub repo for greatzh-sourced papers', () => {
    const { html } = render([
      paper({
        primarySource: 'greatzh',
        rawMetadata: { section: 'Image Splicing' },
      }),
    ])
    expect(html).toContain('greatzh/papers')
    expect(html).toContain('https://github.com/greatzh/papers#image-splicing')
  })

  it('renders the badge in the compact (overflow) list too', () => {
    const papers = Array.from({ length: DIGEST_FULL_CARDS + 1 }, (_, i) =>
      paper({
        id: `p${i}`,
        title: `Paper Number ${i}`,
        primarySource: i === DIGEST_FULL_CARDS ? 'greatzh' : 'arxiv',
        rawMetadata: i === DIGEST_FULL_CARDS ? { section: 'AIGC' } : {},
      }),
    )
    const { html } = render(papers)
    expect(html).toContain('https://github.com/greatzh/papers#aigc')
  })

  it('includes the source link in the plain-text version', () => {
    const { text } = render([
      paper({ primarySource: 'greatzh', rawMetadata: { section: 'Copy Move' } }),
    ])
    expect(text).toContain('https://github.com/greatzh/papers#copy-move')
  })

  it('omits the badge entirely for non-greatzh sources', () => {
    const { html, text } = render([paper({ primarySource: 'arxiv', rawMetadata: {} })])
    expect(html).not.toContain('greatzh/papers')
    expect(text).not.toContain('greatzh/papers')
  })
})

describe('renderDigestEmail — escaping', () => {
  it('escapes untrusted title characters and never emits them raw', () => {
    const { html } = render([paper({ title: 'A <b>& "quoted"</b> tag' })])
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
    expect(html).not.toContain('<b>& "quoted"</b>')
  })
})

describe('renderDigestEmail — top-N split', () => {
  it('renders all titles but pushes the overflow into a compact section', () => {
    const papers = Array.from({ length: DIGEST_FULL_CARDS + 3 }, (_, i) =>
      paper({ id: `p${i}`, title: `Paper Number ${i}` }),
    )
    const { html } = render(papers)
    for (const p of papers) expect(html).toContain(p.title)
    expect(html).toMatch(/data-section="compact"/)
  })

  it('does not render a compact section when at or below the card limit', () => {
    const papers = Array.from({ length: DIGEST_FULL_CARDS }, (_, i) =>
      paper({ id: `p${i}`, title: `Paper ${i}` }),
    )
    expect(render(papers).html).not.toMatch(/data-section="compact"/)
  })
})

describe('renderDigestEmail — quiet week', () => {
  it('renders a no-papers message and a feed link, no card markup', () => {
    const { html, text } = render([])
    expect(html).toMatch(/no new/i)
    expect(text).toMatch(/no new/i)
    expect(html).toContain(APP_URL)
    expect(html).not.toMatch(/data-section="card"/)
  })
})

describe('renderDigestEmail — email safety', () => {
  it('emits no oklch() or CSS custom properties (Gmail cannot resolve them)', () => {
    const { html } = render([paper(), paper({ id: 'b' })])
    expect(html).not.toMatch(/oklch\(/)
    expect(html).not.toMatch(/var\(--/)
  })
})
