// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { partitionStorablePapers, rejectionReason } from '@/lib/ingestion/guards'
import type { NormalisedPaper } from '@/types/paper'

const NOW = new Date('2026-08-21T06:00:00Z')

function paper(overrides: Partial<NormalisedPaper> = {}): NormalisedPaper {
  return {
    title: 'Localizing Copy-Move Forgery in Passport Images',
    authors: ['A. Researcher'],
    abstract: 'An abstract.',
    arxivId: null,
    doi: null,
    venue: 'arXiv',
    venueType: 'arxiv',
    year: 2026,
    publishedDate: new Date('2026-08-20T00:00:00Z'),
    updatedDate: null,
    pdfUrl: 'https://arxiv.org/pdf/2608.08009',
    codeUrl: null,
    citationCount: null,
    primarySource: 'semantic_scholar',
    rawMetadata: {},
    ...overrides,
  }
}

describe('rejectionReason', () => {
  it('accepts a paper with a pdf url published in the past', () => {
    expect(rejectionReason(paper(), NOW)).toBeNull()
  })

  it('rejects a paper with no pdf url', () => {
    expect(rejectionReason(paper({ pdfUrl: null }), NOW)).toBe('no_pdf_url')
  })

  it('rejects a paper with no pdf url even when it has a doi', () => {
    // A DOI resolves to a publisher landing page, not a free PDF. Storing it
    // would put a paywalled row in the feed, which is exactly what we exclude.
    expect(rejectionReason(paper({ pdfUrl: null, doi: '10.1016/j.knosys.2026.116750' }), NOW)).toBe(
      'no_pdf_url',
    )
  })

  it('rejects a doi.org pdf url — it redirects to a landing page, never a PDF', () => {
    expect(
      rejectionReason(paper({ pdfUrl: 'https://doi.org/10.3390/computers15080525' }), NOW),
    ).toBe('paywalled_pdf')
  })

  it.each([
    ['ACM DL', 'https://dl.acm.org/doi/pdf/10.1145/3799825.3818777'],
    ['Springer', 'https://link.springer.com/article/10.1007/s00530-026-02590-6'],
    ['Wiley', 'https://onlinelibrary.wiley.com/doi/10.1002/eng2.70123'],
    ['OUP', 'https://academic.oup.com/cercor/article/35/2/bhaf012'],
    ['Nature', 'https://www.nature.com/articles/s41598-026-12345-6'],
    ['Nature IdP', 'https://idp.nature.com/authorize?response_type=cookie'],
    ['IEEE Xplore', 'https://ieeexplore.ieee.org/document/11630423'],
    ['ScienceDirect', 'https://www.sciencedirect.com/science/article/pii/S0031320326001234'],
  ])('rejects a pdf url hosted on %s', (_label, pdfUrl) => {
    expect(rejectionReason(paper({ pdfUrl }), NOW)).toBe('paywalled_pdf')
  })

  it.each([
    ['arXiv', 'https://arxiv.org/pdf/2608.08009'],
    ['CVF', 'https://openaccess.thecvf.com/content/CVPR2024/papers/Choi_X.pdf'],
    ['OpenReview', 'https://openreview.net/pdf?id=abc123'],
    ['MDPI', 'https://www.mdpi.com/2073-431X/15/8/525'],
    ['bioRxiv', 'https://www.biorxiv.org/content/10.1101/2026.08.01.123456v1'],
    ['Frontiers', 'https://www.frontiersin.org/articles/10.3389/frai.2026.1234567/pdf'],
  ])('accepts a pdf url hosted on %s', (_label, pdfUrl) => {
    expect(rejectionReason(paper({ pdfUrl }), NOW)).toBeNull()
  })

  it('does not let a lookalike host slip past the denylist', () => {
    // Suffix matching must be anchored on a dot boundary, so a host that merely
    // ends with the blocked string is still blocked, but one that only contains
    // it as a substring is not mistaken for the real publisher.
    expect(rejectionReason(paper({ pdfUrl: 'https://cdn.dl.acm.org/x.pdf' }), NOW)).toBe(
      'paywalled_pdf',
    )
    expect(rejectionReason(paper({ pdfUrl: 'https://notacm.org/x.pdf' }), NOW)).toBeNull()
  })

  it('rejects an unparseable pdf url rather than storing it', () => {
    expect(rejectionReason(paper({ pdfUrl: 'not a url' }), NOW)).toBe('paywalled_pdf')
  })

  it('rejects a paper published in the future', () => {
    expect(rejectionReason(paper({ publishedDate: new Date('2026-10-01T00:00:00Z') }), NOW)).toBe(
      'future_dated',
    )
  })

  it('rejects a future-dated paper even when it has a pdf url', () => {
    const future = paper({
      publishedDate: new Date('2026-09-01T00:00:00Z'),
      pdfUrl: 'https://example.org/paper.pdf',
    })
    expect(rejectionReason(future, NOW)).toBe('future_dated')
  })

  it('accepts a paper published earlier today', () => {
    // S2 gives date-only precision, so today's papers arrive as 00:00 UTC.
    // These must not be mistaken for future-dated rows.
    expect(
      rejectionReason(paper({ publishedDate: new Date('2026-08-21T00:00:00Z') }), NOW),
    ).toBeNull()
  })

  it('reports the missing pdf first when a paper fails both checks', () => {
    const bad = paper({ pdfUrl: null, publishedDate: new Date('2026-10-01T00:00:00Z') })
    expect(rejectionReason(bad, NOW)).toBe('no_pdf_url')
  })
})

describe('partitionStorablePapers', () => {
  it('splits accepted from rejected and counts reasons', () => {
    const input = [
      paper({ title: 'good' }),
      paper({ title: 'no pdf', pdfUrl: null }),
      paper({ title: 'future', publishedDate: new Date('2026-09-15T00:00:00Z') }),
      paper({ title: 'paywalled', pdfUrl: 'https://dl.acm.org/doi/pdf/10.1145/1' }),
      paper({ title: 'also good' }),
    ]

    const { accepted, rejected } = partitionStorablePapers(input, NOW)

    expect(accepted.map((p) => p.title)).toEqual(['good', 'also good'])
    expect(rejected).toEqual({ no_pdf_url: 1, paywalled_pdf: 1, future_dated: 1 })
  })

  it('returns zeroed counts when everything is storable', () => {
    const { accepted, rejected } = partitionStorablePapers([paper(), paper()], NOW)
    expect(accepted).toHaveLength(2)
    expect(rejected).toEqual({ no_pdf_url: 0, paywalled_pdf: 0, future_dated: 0 })
  })

  it('does not mutate the input array', () => {
    const input = [paper({ pdfUrl: null }), paper()]
    partitionStorablePapers(input, NOW)
    expect(input).toHaveLength(2)
  })
})
