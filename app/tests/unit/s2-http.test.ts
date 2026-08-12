// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { s2Request } from '@/lib/ingestion/s2-http'

function ok(body: unknown): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

function fail(status: number, headers: Record<string, string> = {}): () => Promise<Response> {
  return () => Promise.resolve(new Response('{}', { status, headers }))
}

function mockFetch(...responders: Array<() => Promise<Response>>) {
  const spy = vi.spyOn(globalThis, 'fetch')
  const last = responders[responders.length - 1]!
  responders.slice(0, -1).forEach((r) => spy.mockImplementationOnce(r))
  return spy.mockImplementation(last)
}

const URL_UNDER_TEST = 'https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=x'

describe('s2Request', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns parsed JSON on success', async () => {
    mockFetch(ok({ total: 1 }))
    await expect(s2Request(URL_UNDER_TEST, { backoffMs: 0 })).resolves.toEqual({ total: 1 })
  })

  it('retries 429 up to five attempts before giving up', async () => {
    const spy = mockFetch(fail(429))
    await expect(s2Request(URL_UNDER_TEST, { backoffMs: 0 })).rejects.toThrow(/429/)
    expect(spy).toHaveBeenCalledTimes(5)
  })

  it('retries 5xx', async () => {
    const spy = mockFetch(fail(503), ok({ ok: true }))
    await expect(s2Request(URL_UNDER_TEST, { backoffMs: 0 })).resolves.toEqual({ ok: true })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-429 4xx — the request itself is wrong', async () => {
    const spy = mockFetch(fail(400))
    await expect(s2Request(URL_UNDER_TEST, { backoffMs: 0 })).rejects.toThrow(/400/)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('waits for the Retry-After interval when upstream supplies one', async () => {
    vi.useFakeTimers()
    try {
      const spy = mockFetch(fail(429, { 'retry-after': '5' }), ok({ ok: true }))
      const pending = s2Request(URL_UNDER_TEST, { backoffMs: 2000 })

      await vi.advanceTimersByTimeAsync(4999)
      expect(spy).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2)
      await expect(pending).resolves.toEqual({ ok: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps an absurd Retry-After so a job cannot be parked for hours', async () => {
    vi.useFakeTimers()
    try {
      const spy = mockFetch(fail(429, { 'retry-after': '86400' }), ok({ ok: true }))
      const pending = s2Request(URL_UNDER_TEST, { backoffMs: 2000 })

      await vi.advanceTimersByTimeAsync(60_000)
      await expect(pending).resolves.toEqual({ ok: true })
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends a POST with a JSON body when one is supplied', async () => {
    const spy = mockFetch(ok([]))
    await s2Request('https://api.semanticscholar.org/graph/v1/paper/batch', {
      backoffMs: 0,
      body: { ids: ['ARXIV:1'] },
    })

    const init = spy.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ ids: ['ARXIV:1'] })
  })
})
