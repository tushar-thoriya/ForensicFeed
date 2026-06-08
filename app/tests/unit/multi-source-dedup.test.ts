// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface PaperRow {
  id: string
  arxivId: string | null
  doi: string | null
  titleHash: string
  title: string
  abstract: string | null
  codeUrl: string | null
  citationCount: number | null
  publishedDate: Date
  updatedDate: Date | null
  primarySource: string
  relevanceScore: number
  relevanceTags: string[]
  [key: string]: unknown
}

const store: { rows: PaperRow[] } = { rows: [] }

vi.mock('@/lib/db/client', () => {
  // Minimal Drizzle-shaped mock backed by an in-memory array. Each chained
  // builder captures a predicate function the caller can resolve against the
  // store. Only the predicates the production code path uses are supported.
  function rowsMatching(predicate?: (row: PaperRow) => boolean): PaperRow[] {
    return predicate ? store.rows.filter(predicate) : [...store.rows]
  }

  function makeSelectBuilder() {
    let predicate: ((row: PaperRow) => boolean) | undefined
    const builder = {
      from: () => builder,
      where: (pred: (row: PaperRow) => boolean) => {
        predicate = pred
        return builder
      },
      limit: async (n: number) => rowsMatching(predicate).slice(0, n),
    }
    return builder
  }

  function makeInsertBuilder() {
    return {
      values: async (row: PaperRow) => {
        store.rows.push({ ...row })
      },
    }
  }

  function makeUpdateBuilder() {
    return {
      set: (patch: Partial<PaperRow>) => ({
        where: async (pred: (row: PaperRow) => boolean) => {
          store.rows = store.rows.map((row) => (pred(row) ? { ...row, ...patch } : row))
        },
      }),
    }
  }

  // Drizzle's column comparators (eq) return SQL objects in production. We
  // substitute predicate factories so the in-memory store can evaluate them.
  return {
    db: {
      select: () => makeSelectBuilder(),
      insert: () => makeInsertBuilder(),
      update: () => makeUpdateBuilder(),
    },
    schema: {},
  }
})

vi.mock('drizzle-orm', async () => {
  // Replace eq() with a predicate factory matched by column key. The mocked
  // schema below exposes columns as plain objects with a `key` field so the
  // predicate can read it back.
  const eq =
    (column: { key: keyof PaperRow }, value: unknown) =>
    (row: PaperRow): boolean =>
      row[column.key] === value
  return {
    eq,
    and:
      (...preds: Array<(row: PaperRow) => boolean>) =>
      (row: PaperRow) =>
        preds.every((p) => p(row)),
    desc: (col: unknown) => col,
    gte: () => () => true,
    sql: () => null,
  }
})

vi.mock('@/lib/db/schema', () => {
  // Mirror the column keys the queries module reads (arxivId, doi, titleHash,
  // id). Each is a tagged object so the eq() factory can identify the column.
  const papers = {
    id: { key: 'id' },
    arxivId: { key: 'arxivId' },
    doi: { key: 'doi' },
    titleHash: { key: 'titleHash' },
    relevanceScore: { key: 'relevanceScore' },
    publishedDate: { key: 'publishedDate' },
  }
  return { papers }
})

import { upsertPaper } from '@/lib/db/queries/papers'
import type { NormalisedPaper } from '@/types/paper'

const baseTitle = 'Copy-move forgery localization in document images'
const baseAbstract =
  'We present a method for forgery detection and pixel-level localization of manipulated regions in ID document photos.'
const publishedDate = new Date('2026-04-15T12:00:00Z')

function arxivPaper(): NormalisedPaper {
  return {
    title: baseTitle,
    authors: ['A. Author'],
    abstract: baseAbstract,
    arxivId: '2604.12345',
    doi: null,
    venue: 'arXiv',
    venueType: 'arxiv',
    year: 2026,
    publishedDate,
    updatedDate: null,
    pdfUrl: 'http://arxiv.org/pdf/2604.12345v1.pdf',
    codeUrl: null,
    citationCount: null,
    primarySource: 'arxiv',
    rawMetadata: { source: 'arxiv' },
  }
}

function huggingfacePaper(): NormalisedPaper {
  return {
    ...arxivPaper(),
    pdfUrl: null,
    codeUrl: 'https://github.com/example/forgery-loc',
    citationCount: null,
    primarySource: 'huggingface',
    rawMetadata: { source: 'huggingface' },
  }
}

function semanticScholarPaper(): NormalisedPaper {
  return {
    ...arxivPaper(),
    pdfUrl: null,
    codeUrl: null,
    citationCount: 42,
    primarySource: 'semantic_scholar',
    rawMetadata: { source: 'semantic_scholar' },
  }
}

// Conference papers often arrive via CVF/OR scraping with no arXiv link, so
// the dedup code path must collapse them onto an existing arXiv row via
// title-hash. arxivId is intentionally null here.
function cvfPaper(): NormalisedPaper {
  return {
    ...arxivPaper(),
    arxivId: null,
    venue: 'CVPR 2026',
    venueType: 'conference',
    pdfUrl: 'https://openaccess.thecvf.com/content/CVPR2026/papers/copy_move.pdf',
    codeUrl: null,
    citationCount: null,
    primarySource: 'cvf',
    rawMetadata: { source: 'cvf', venueCode: 'CVPR2026' },
  }
}

describe('multi-source dedup', () => {
  beforeEach(() => {
    store.rows = []
  })

  it('merges the same paper from arXiv, HF, and S2 into one row', async () => {
    const r1 = await upsertPaper(arxivPaper())
    const r2 = await upsertPaper(huggingfacePaper())
    const r3 = await upsertPaper(semanticScholarPaper())

    expect(r1.inserted).toBe(true)
    expect(r2.inserted).toBe(false)
    expect(r3.inserted).toBe(false)

    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]?.id).toBe('arxiv:2604.12345')
  })

  it('enriches code_url from HF and citation_count from S2 without losing arxiv fields', async () => {
    await upsertPaper(arxivPaper())
    await upsertPaper(huggingfacePaper())
    await upsertPaper(semanticScholarPaper())

    const row = store.rows[0]
    expect(row?.codeUrl).toBe('https://github.com/example/forgery-loc')
    expect(row?.citationCount).toBe(42)
    expect(row?.arxivId).toBe('2604.12345')
    // Primary source is set on insert and never overwritten on enrichment.
    expect(row?.primarySource).toBe('arxiv')
    // Published date must not be overwritten by later sources.
    expect(row?.publishedDate).toEqual(publishedDate)
  })

  it('does not null out a previously set codeUrl when a later source omits it', async () => {
    await upsertPaper(huggingfacePaper())
    await upsertPaper(semanticScholarPaper())

    const row = store.rows[0]
    expect(row?.codeUrl).toBe('https://github.com/example/forgery-loc')
  })

  it('treats S2 enrichment as a no-op for fields it does not provide', async () => {
    await upsertPaper(arxivPaper())
    const beforeAbstract = store.rows[0]?.abstract
    await upsertPaper({ ...semanticScholarPaper(), abstract: null })
    expect(store.rows[0]?.abstract).toBe(beforeAbstract)
  })

  it('merges a CVF conference paper into an existing arXiv row via title-hash', async () => {
    await upsertPaper(arxivPaper())
    await upsertPaper(huggingfacePaper())
    await upsertPaper(semanticScholarPaper())
    const cvfResult = await upsertPaper(cvfPaper())

    expect(cvfResult.inserted).toBe(false)
    expect(store.rows).toHaveLength(1)

    const row = store.rows[0]
    // The original arxiv-derived id is preserved.
    expect(row?.id).toBe('arxiv:2604.12345')
    expect(row?.arxivId).toBe('2604.12345')
    // The earlier-set codeUrl from HF survives.
    expect(row?.codeUrl).toBe('https://github.com/example/forgery-loc')
    // S2 citation count survives.
    expect(row?.citationCount).toBe(42)
    // primarySource never gets overwritten by later enrichments.
    expect(row?.primarySource).toBe('arxiv')
  })
})
