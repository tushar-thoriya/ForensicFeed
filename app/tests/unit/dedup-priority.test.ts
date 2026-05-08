// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type SelectCall = {
  // The conditions argument passed to .where(); kept opaque since it's an
  // internal Drizzle SQL object. We just count how many lookups happened
  // and which return rows were served by the mock.
  index: number
}

const state = {
  selectCalls: [] as SelectCall[],
  // Per-call return rows. Each entry corresponds to one .limit() resolution.
  selectReturns: [] as Array<{ id: string }[]>,
  insertedRow: null as Record<string, unknown> | null,
  updatedRow: null as Record<string, unknown> | null,
}

vi.mock('@/lib/db/client', () => {
  const selectBuilder = {
    from: () => selectBuilder,
    where: () => selectBuilder,
    limit: async () => {
      const idx = state.selectCalls.length
      state.selectCalls.push({ index: idx })
      return state.selectReturns[idx] ?? []
    },
  }
  const insertBuilder = {
    values: async (row: Record<string, unknown>) => {
      state.insertedRow = row
    },
  }
  const updateBuilder = {
    set: (row: Record<string, unknown>) => ({
      where: async () => {
        state.updatedRow = row
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
    title: 'Forgery Localization in Document Images',
    authors: ['A. Author'],
    abstract: 'Abstract about forgery detection and localization.',
    arxivId: '2604.99999',
    doi: '10.1109/X.2026.99999',
    venue: 'arXiv',
    venueType: 'arxiv',
    year: 2026,
    publishedDate: new Date('2026-04-15T12:00:00Z'),
    updatedDate: null,
    pdfUrl: null,
    codeUrl: null,
    citationCount: null,
    primarySource: 'arxiv',
    rawMetadata: {},
    ...overrides,
  }
}

beforeEach(() => {
  state.selectCalls = []
  state.selectReturns = []
  state.insertedRow = null
  state.updatedRow = null
})

describe('findExistingPaper priority order (arxivId > doi > titleHash)', () => {
  it('returns the arxivId match without consulting doi or titleHash', async () => {
    state.selectReturns = [[{ id: 'arxiv:2604.99999' }]]
    await upsertPaper(makePaper())
    expect(state.selectCalls.length).toBe(1)
    expect(state.updatedRow).not.toBeNull()
    expect(state.insertedRow).toBeNull()
  })

  it('falls through to doi when arxivId returns no row', async () => {
    state.selectReturns = [[], [{ id: 'doi:10.1109/X.2026.99999' }]]
    await upsertPaper(makePaper())
    expect(state.selectCalls.length).toBe(2)
    expect(state.updatedRow).not.toBeNull()
    expect(state.insertedRow).toBeNull()
  })

  it('falls through to titleHash only when both arxivId and doi miss', async () => {
    state.selectReturns = [[], [], [{ id: 'hash:abc' }]]
    await upsertPaper(makePaper())
    expect(state.selectCalls.length).toBe(3)
    expect(state.updatedRow).not.toBeNull()
    expect(state.insertedRow).toBeNull()
  })

  it('inserts a new row when no identifier matches', async () => {
    state.selectReturns = [[], [], []]
    await upsertPaper(makePaper())
    expect(state.selectCalls.length).toBe(3)
    expect(state.insertedRow).not.toBeNull()
    expect(state.updatedRow).toBeNull()
  })

  it('skips arxivId lookup when arxivId is null', async () => {
    state.selectReturns = [[{ id: 'doi:10.1109/X.2026.99999' }]]
    await upsertPaper(makePaper({ arxivId: null }))
    expect(state.selectCalls.length).toBe(1)
    expect(state.updatedRow).not.toBeNull()
  })

  it('skips both arxivId and doi lookups when neither is present', async () => {
    state.selectReturns = [[]]
    await upsertPaper(makePaper({ arxivId: null, doi: null }))
    expect(state.selectCalls.length).toBe(1)
    expect(state.insertedRow).not.toBeNull()
  })
})

describe('upsertPaper enrichment merge (never null out previously-set fields)', () => {
  it('persists codeUrl when present, omits it when null', async () => {
    state.selectReturns = [[{ id: 'arxiv:2604.99999' }]]
    await upsertPaper(makePaper({ codeUrl: 'https://github.com/example/repo' }))
    expect(state.updatedRow?.codeUrl).toBe('https://github.com/example/repo')

    state.selectCalls = []
    state.selectReturns = [[{ id: 'arxiv:2604.99999' }]]
    state.updatedRow = null
    await upsertPaper(makePaper({ codeUrl: null }))
    expect(state.updatedRow).not.toBeNull()
    expect('codeUrl' in (state.updatedRow ?? {})).toBe(false)
  })

  it('persists citationCount when present, omits it when null', async () => {
    state.selectReturns = [[{ id: 'arxiv:2604.99999' }]]
    await upsertPaper(makePaper({ citationCount: 42 }))
    expect(state.updatedRow?.citationCount).toBe(42)

    state.selectCalls = []
    state.selectReturns = [[{ id: 'arxiv:2604.99999' }]]
    state.updatedRow = null
    await upsertPaper(makePaper({ citationCount: null }))
    expect(state.updatedRow).not.toBeNull()
    expect('citationCount' in (state.updatedRow ?? {})).toBe(false)
  })
})
