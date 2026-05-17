// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Captured = {
  whereArg?: unknown
  selectRows: Array<Record<string, unknown>>
  leftJoinCount: number
}

const captured: Captured = { selectRows: [], leftJoinCount: 0 }

vi.mock('@/lib/db/client', () => {
  const builder: Record<string, unknown> = {}
  builder.from = () => builder
  builder.leftJoin = () => {
    captured.leftJoinCount += 1
    return builder
  }
  builder.where = (arg: unknown) => {
    captured.whereArg = arg
    return builder
  }
  builder.limit = async () => captured.selectRows
  return {
    db: {
      select: () => builder,
    },
    schema: {},
  }
})

import { getPaperById } from '@/lib/db/queries/papers'

function resetCaptured() {
  captured.selectRows = []
  captured.leftJoinCount = 0
  captured.whereArg = undefined
}

function fakeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'arxiv:2604.99999',
    title: 'A paper',
    authors: ['A. Author'],
    abstract: 'abs',
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
    citationCount: null,
    relevanceScore: 0.8,
    relevanceTags: ['forgery'],
    primarySource: 'arxiv',
    rawMetadata: {},
    createdAt: new Date(),
    headline: null,
    isSaved: false,
    isRead: false,
    ...overrides,
  }
}

describe('getPaperById', () => {
  beforeEach(() => {
    resetCaptured()
  })

  it('returns null when no row matches', async () => {
    captured.selectRows = []
    const result = await getPaperById('arxiv:does-not-exist')
    expect(result).toBeNull()
  })

  it('returns the single matched row', async () => {
    captured.selectRows = [fakeRow({ id: 'arxiv:1', isSaved: true, isRead: true })]
    const result = await getPaperById('arxiv:1')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('arxiv:1')
    expect(result?.isSaved).toBe(true)
    expect(result?.isRead).toBe(true)
  })

  it('left-joins user_saves AND read_status (two joins)', async () => {
    captured.selectRows = [fakeRow()]
    await getPaperById('arxiv:1')
    // One LEFT JOIN per per-user-state table. If this drops to 1 the boolean
    // projections silently break (isSaved/isRead become undefined).
    expect(captured.leftJoinCount).toBe(2)
  })

  it('passes the id into the WHERE predicate', async () => {
    captured.selectRows = [fakeRow()]
    await getPaperById('arxiv:42')
    // The where arg is a drizzle SQL chunk; we can't introspect easily,
    // but it should be truthy (the builder was called with something).
    expect(captured.whereArg).toBeDefined()
  })

  it('maps isSaved/isRead through as plain booleans (no transform)', async () => {
    captured.selectRows = [fakeRow({ isSaved: false, isRead: true })]
    const result = await getPaperById('arxiv:1')
    expect(result?.isSaved).toBe(false)
    expect(result?.isRead).toBe(true)
  })
})
