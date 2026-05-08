// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Captured = {
  inserted?: Record<string, unknown>
  updated?: Record<string, unknown>
  selectRows: Array<{ id: string }>
}

const captured: Captured = { selectRows: [] }

vi.mock('@/lib/db/client', () => {
  const selectBuilder = {
    from: () => selectBuilder,
    where: () => selectBuilder,
    limit: async () => captured.selectRows,
  }
  const insertBuilder = {
    values: async (row: Record<string, unknown>) => {
      captured.inserted = row
    },
  }
  const updateBuilder = {
    set: (row: Record<string, unknown>) => ({
      where: async () => {
        captured.updated = row
      },
    }),
  }
  return {
    db: {
      select: () => selectBuilder,
      insert: () => insertBuilder,
      update: () => updateBuilder,
    },
    schema: {},
  }
})

import { upsertPaper } from '@/lib/db/queries/papers'
import type { NormalisedPaper } from '@/types/paper'

function makePaper(overrides: Partial<NormalisedPaper> = {}): NormalisedPaper {
  return {
    title: 'Copy-move forgery localization in document images',
    authors: ['A. Author'],
    abstract:
      'We present a method for forgery detection and pixel-level localization of manipulated regions in ID document photos.',
    arxivId: '2604.99999',
    doi: null,
    venue: 'arXiv',
    venueType: 'arxiv',
    year: 2026,
    publishedDate: new Date('2026-04-15T12:00:00Z'),
    updatedDate: null,
    pdfUrl: 'http://arxiv.org/pdf/2604.99999v1.pdf',
    codeUrl: null,
    citationCount: null,
    primarySource: 'arxiv',
    rawMetadata: {},
    ...overrides,
  }
}

describe('upsertPaper — relevance wiring', () => {
  beforeEach(() => {
    captured.inserted = undefined
    captured.updated = undefined
    captured.selectRows = []
  })

  it('computes relevance score and tags on insert', async () => {
    captured.selectRows = []
    await upsertPaper(makePaper())
    expect(captured.inserted).toBeDefined()
    const row = captured.inserted!
    expect(row.relevanceScore).toBeTypeOf('number')
    expect(row.relevanceScore).toBeGreaterThan(0.2)
    expect(Array.isArray(row.relevanceTags)).toBe(true)
    expect(row.relevanceTags).toContain('localization')
  })

  it('stores a non-negative score and array tags even for low-relevance papers', async () => {
    captured.selectRows = []
    await upsertPaper(
      makePaper({
        title: 'A study of unrelated image classification',
        abstract: 'We benchmark classifiers on natural images.',
      }),
    )
    const row = captured.inserted!
    expect(row.relevanceScore).toBeGreaterThanOrEqual(0)
    expect(row.relevanceTags).toEqual([])
  })

  it('re-computes score and tags on update', async () => {
    captured.selectRows = [{ id: 'arxiv:2604.99999' }]
    await upsertPaper(
      makePaper({
        abstract:
          'Revised abstract with stronger focus on splicing detection and document forgery.',
      }),
    )
    expect(captured.updated).toBeDefined()
    const row = captured.updated!
    expect(row.relevanceScore).toBeTypeOf('number')
    expect(row.relevanceScore).toBeGreaterThan(0)
    expect(Array.isArray(row.relevanceTags)).toBe(true)
  })

  it('caps the stored score at 1.0', async () => {
    captured.selectRows = []
    await upsertPaper(
      makePaper({
        title:
          'Forgery detection and forgery localization for tamper detection and manipulation detection in document forgery',
        abstract:
          'We study image forensics, splicing detection, copy-move detection, inpainting detection, document authentication, and document verification.',
      }),
    )
    const row = captured.inserted!
    expect(row.relevanceScore).toBeLessThanOrEqual(1.0)
  })
})
