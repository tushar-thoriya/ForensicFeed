// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCitationCounts, toBatchId } from '@/lib/ingestion/s2-citations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function bodyOf(call: unknown[] | undefined): { ids: string[] } {
  const init = call?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body)) as { ids: string[] }
}

describe('toBatchId', () => {
  it('prefers the arXiv id with an ARXIV: prefix', () => {
    expect(toBatchId({ arxivId: '2608.08009', doi: '10.1/x' })).toBe('ARXIV:2608.08009')
  })

  it('falls back to a DOI: prefixed doi', () => {
    expect(toBatchId({ arxivId: null, doi: '10.1109/TIFS.2019.2938670' })).toBe(
      'DOI:10.1109/TIFS.2019.2938670',
    )
  })

  it('returns null when the row has no external identifier', () => {
    expect(toBatchId({ arxivId: null, doi: null })).toBeNull()
  })
})

describe('fetchCitationCounts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('POSTs to the batch endpoint with the ids in the body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse([{ citationCount: 12 }]))

    await fetchCitationCounts(['ARXIV:2608.08009'], { apiKey: 'k', throttleMs: 0 })

    const [input, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(new URL(String(input)).pathname).toBe('/graph/v1/paper/batch')
    expect(init.method).toBe('POST')
    expect(bodyOf(fetchSpy.mock.calls[0])).toEqual({ ids: ['ARXIV:2608.08009'] })
  })

  it('maps counts back to the ids that produced them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([{ citationCount: 771 }, { citationCount: 22 }]),
    )

    const counts = await fetchCitationCounts(['ARXIV:1805.04953', 'ARXIV:2404.04933'], {
      apiKey: 'k',
      throttleMs: 0,
    })

    expect(counts.get('ARXIV:1805.04953')).toBe(771)
    expect(counts.get('ARXIV:2404.04933')).toBe(22)
  })

  it('handles the positional nulls S2 returns for unknown ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([{ citationCount: 5 }, null, { citationCount: 9 }]),
    )

    const counts = await fetchCitationCounts(['DOI:a', 'DOI:missing', 'DOI:c'], {
      apiKey: 'k',
      throttleMs: 0,
    })

    expect(counts.get('DOI:a')).toBe(5)
    expect(counts.has('DOI:missing')).toBe(false)
    // Critical: the null must not shift 'DOI:c' onto the wrong count.
    expect(counts.get('DOI:c')).toBe(9)
  })

  it('chunks requests at the 500-id API ceiling', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const parsed = JSON.parse(String((init as RequestInit).body)) as { ids: string[] }
      return Promise.resolve(jsonResponse(parsed.ids.map((_, i) => ({ citationCount: i }))))
    })

    const ids = Array.from({ length: 1200 }, (_, i) => `DOI:10.1/${i}`)
    const counts = await fetchCitationCounts(ids, { apiKey: 'k', throttleMs: 0 })

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    for (const call of fetchSpy.mock.calls) {
      expect(bodyOf(call).ids.length).toBeLessThanOrEqual(500)
    }
    expect(counts.size).toBe(1200)
  })

  it('retries a 429 chunk rather than losing it', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ message: 'Too Many Requests' }, 429))
      .mockResolvedValue(jsonResponse([{ citationCount: 3 }]))

    const counts = await fetchCitationCounts(['DOI:a'], { apiKey: 'k', throttleMs: 0 })

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(counts.get('DOI:a')).toBe(3)
  })

  it('skips a permanently failing chunk without discarding healthy ones', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const parsed = JSON.parse(String((init as RequestInit).body)) as { ids: string[] }
      if (parsed.ids.includes('DOI:poison')) {
        return Promise.resolve(jsonResponse({ message: 'boom' }, 500))
      }
      return Promise.resolve(jsonResponse(parsed.ids.map(() => ({ citationCount: 1 }))))
    })

    const ids = [...Array.from({ length: 500 }, (_, i) => `DOI:ok${i}`), 'DOI:poison']
    const counts = await fetchCitationCounts(ids, { apiKey: 'k', throttleMs: 0 })

    expect(counts.size).toBe(500)
    expect(counts.has('DOI:poison')).toBe(false)
  })

  it('returns an empty map for an empty id list without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const counts = await fetchCitationCounts([], { apiKey: 'k', throttleMs: 0 })
    expect(counts.size).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
