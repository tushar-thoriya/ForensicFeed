// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { id: string; arxivId: string | null; doi: string | null }

const state: { rows: Row[]; updates: Array<{ id: string; citationCount: number }> } = {
  rows: [],
  updates: [],
}

vi.mock('@/lib/db/client', () => {
  const selectBuilder = {
    from: () => selectBuilder,
    where: () => selectBuilder,
    limit: async () => state.rows,
  }
  const updateBuilder = {
    set: (values: Record<string, unknown>) => ({
      where: async (condition: unknown) => {
        state.updates.push({
          id: String((condition as { __id?: string })?.__id ?? ''),
          citationCount: Number(values.citationCount),
        })
      },
    }),
  }
  return {
    getDb: () => ({ select: () => selectBuilder, update: () => updateBuilder }),
    schema: {},
  }
})

import { refreshCitationCounts } from '@/lib/ingestion/refresh-citations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  state.rows = []
  state.updates = []
  vi.restoreAllMocks()
})

describe('refreshCitationCounts', () => {
  it('reports zero work when no rows are missing a citation count', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await refreshCitationCounts({ apiKey: 'k', throttleMs: 0 })

    expect(result.scanned).toBe(0)
    expect(result.updated).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves counts for rows carrying an external identifier', async () => {
    state.rows = [
      { id: 'arxiv:2608.08009', arxivId: '2608.08009', doi: null },
      { id: 'doi:10.1/x', arxivId: null, doi: '10.1/x' },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([{ citationCount: 11 }, { citationCount: 4 }]),
    )

    const result = await refreshCitationCounts({ apiKey: 'k', throttleMs: 0 })

    expect(result.scanned).toBe(2)
    expect(result.updated).toBe(2)
  })

  it('ignores rows with no external identifier — they can never be resolved', async () => {
    state.rows = [
      { id: 'hash:abc', arxivId: null, doi: null },
      { id: 'arxiv:2608.08009', arxivId: '2608.08009', doi: null },
    ]
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse([{ citationCount: 11 }]))

    const result = await refreshCitationCounts({ apiKey: 'k', throttleMs: 0 })

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as {
      ids: string[]
    }
    expect(body.ids).toEqual(['ARXIV:2608.08009'])
    expect(result.updated).toBe(1)
  })

  it('does not write a row whose count S2 could not resolve', async () => {
    state.rows = [
      { id: 'arxiv:a', arxivId: 'a', doi: null },
      { id: 'arxiv:b', arxivId: 'b', doi: null },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{ citationCount: 6 }, null]))

    const result = await refreshCitationCounts({ apiKey: 'k', throttleMs: 0 })

    expect(result.scanned).toBe(2)
    expect(result.updated).toBe(1)
  })
})
