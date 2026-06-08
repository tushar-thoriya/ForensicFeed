// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import { PaperDetail } from '@/components/paper-detail/PaperDetail'
import type { PaperWithUserState } from '@/types/paper'

function makePaper(overrides: Partial<PaperWithUserState> = {}): PaperWithUserState {
  return {
    id: 'arxiv:2604.99999',
    title: 'Image forgery localization with diffusion-prior features',
    authors: ['A. One', 'B. Two', 'C. Three', 'D. Four'],
    abstract: 'We present a method.',
    arxivId: '2604.99999',
    doi: null,
    titleHash: 'hash',
    venue: 'arXiv',
    venueType: 'arxiv',
    year: 2026,
    publishedDate: new Date('2026-04-15T00:00:00Z'),
    updatedDate: null,
    pdfUrl: 'http://arxiv.org/pdf/2604.99999v1.pdf',
    codeUrl: null,
    citationCount: 12,
    relevanceScore: 0.82,
    relevanceTags: ['forgery', 'localization'],
    primarySource: 'arxiv',
    rawMetadata: {},
    createdAt: new Date(),
    headline: null,
    isSaved: false,
    isRead: false,
    ...overrides,
  } as PaperWithUserState
}

describe('PaperDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the title and full author list (no truncation)', () => {
    const { getByRole, getByText } = render(<PaperDetail paper={makePaper()} />)
    expect(getByRole('heading', { level: 1 }).textContent).toContain('Image forgery localization')
    // All 4 authors should be present — detail page does not truncate.
    expect(getByText(/A\. One, B\. Two, C\. Three, D\. Four/)).toBeTruthy()
  })

  it('renders the back link to /', () => {
    const { getByRole } = render(<PaperDetail paper={makePaper()} />)
    const back = getByRole('link', { name: /back to feed/i })
    expect(back.getAttribute('href')).toBe('/')
  })

  it('renders a primary "Open PDF" CTA when pdfUrl is set', () => {
    const { getByRole } = render(<PaperDetail paper={makePaper()} />)
    const cta = getByRole('link', { name: /open pdf/i })
    expect(cta.getAttribute('href')).toBe('http://arxiv.org/pdf/2604.99999v1.pdf')
    expect(cta.getAttribute('target')).toBe('_blank')
    expect(cta.getAttribute('rel')).toContain('noopener')
  })

  it('falls back to arXiv abs link when pdfUrl is missing but arxivId is set', () => {
    const { getByRole } = render(
      <PaperDetail paper={makePaper({ pdfUrl: null, arxivId: '1234.5678' })} />,
    )
    const cta = getByRole('link', { name: /open on arxiv/i })
    expect(cta.getAttribute('href')).toBe('https://arxiv.org/abs/1234.5678')
  })

  it('does not render a primary CTA when neither pdfUrl nor arxivId is set', () => {
    const { queryByRole } = render(
      <PaperDetail paper={makePaper({ pdfUrl: null, arxivId: null })} />,
    )
    expect(queryByRole('link', { name: /open pdf/i })).toBeNull()
    expect(queryByRole('link', { name: /open on arxiv/i })).toBeNull()
  })

  it('renders all relevance tags (no slicing to 4)', () => {
    const tags = ['t1', 't2', 't3', 't4', 't5', 't6']
    const { getByText } = render(<PaperDetail paper={makePaper({ relevanceTags: tags })} />)
    for (const t of tags) {
      expect(getByText(t)).toBeTruthy()
    }
  })

  it('shows Save + Read toggles wired to the paper id', () => {
    const { getByRole } = render(<PaperDetail paper={makePaper({ isSaved: true })} />)
    const save = getByRole('button', { name: /unsave paper/i })
    expect(save.getAttribute('aria-pressed')).toBe('true')
    const readCheckbox = getByRole('checkbox') as HTMLInputElement
    expect(readCheckbox.checked).toBe(false)
  })

  it('omits the code link section when codeUrl is null', () => {
    const { queryByRole } = render(<PaperDetail paper={makePaper({ codeUrl: null })} />)
    expect(queryByRole('link', { name: /view code/i })).toBeNull()
  })

  it('renders the code link when codeUrl is present', () => {
    const { getByRole } = render(
      <PaperDetail paper={makePaper({ codeUrl: 'https://github.com/x/y' })} />,
    )
    const code = getByRole('link', { name: /view code/i })
    expect(code.getAttribute('href')).toBe('https://github.com/x/y')
  })
})
