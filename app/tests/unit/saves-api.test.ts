// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Stub the mutation module so the route handler can run without a DB.
vi.mock('@/lib/db/queries/saves', () => ({
  setSaved: vi.fn(async () => undefined),
  setReadStatus: vi.fn(async () => undefined),
}))

import { POST as savesPOST } from '@/app/api/saves/route'
import { POST as readStatusPOST } from '@/app/api/read-status/route'
import { setSaved, setReadStatus } from '@/lib/db/queries/saves'

function postRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/saves', () => {
  beforeEach(() => {
    vi.mocked(setSaved).mockClear()
    vi.mocked(setSaved).mockResolvedValue(undefined)
  })

  it('returns 200 and calls setSaved(true) on { saved: true }', async () => {
    const res = await savesPOST(
      postRequest('http://x/api/saves', { paperId: 'arxiv:2406.00001', saved: true }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    expect(setSaved).toHaveBeenCalledWith('arxiv:2406.00001', true)
  })

  it('returns 200 and calls setSaved(false) on { saved: false }', async () => {
    const res = await savesPOST(
      postRequest('http://x/api/saves', { paperId: 'arxiv:2406.00001', saved: false }),
    )
    expect(res.status).toBe(200)
    expect(setSaved).toHaveBeenCalledWith('arxiv:2406.00001', false)
  })

  it('returns 400 on missing paperId', async () => {
    const res = await savesPOST(postRequest('http://x/api/saves', { saved: true }))
    expect(res.status).toBe(400)
    expect(setSaved).not.toHaveBeenCalled()
  })

  it('returns 400 on non-boolean saved', async () => {
    const res = await savesPOST(
      postRequest('http://x/api/saves', { paperId: 'arxiv:1', saved: 'yes' }),
    )
    expect(res.status).toBe(400)
    expect(setSaved).not.toHaveBeenCalled()
  })

  it('returns 400 on empty paperId', async () => {
    const res = await savesPOST(
      postRequest('http://x/api/saves', { paperId: '', saved: true }),
    )
    expect(res.status).toBe(400)
    expect(setSaved).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed JSON', async () => {
    const res = await savesPOST(postRequest('http://x/api/saves', '{not json'))
    expect(res.status).toBe(400)
    expect(setSaved).not.toHaveBeenCalled()
  })

  it('returns 500 with generic message when mutation throws', async () => {
    vi.mocked(setSaved).mockRejectedValueOnce(new Error('db down: secret-host:5432'))
    const res = await savesPOST(
      postRequest('http://x/api/saves', { paperId: 'arxiv:1', saved: true }),
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    // Error message MUST NOT leak the inner error string (could contain host
    // names, table names, query fragments).
    expect(JSON.stringify(body)).not.toContain('secret-host')
  })

  it('is idempotent on repeated identical calls (handler does not throw)', async () => {
    await savesPOST(
      postRequest('http://x/api/saves', { paperId: 'arxiv:1', saved: true }),
    )
    const second = await savesPOST(
      postRequest('http://x/api/saves', { paperId: 'arxiv:1', saved: true }),
    )
    expect(second.status).toBe(200)
    expect(setSaved).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/read-status', () => {
  beforeEach(() => {
    vi.mocked(setReadStatus).mockClear()
    vi.mocked(setReadStatus).mockResolvedValue(undefined)
  })

  it('returns 200 and calls setReadStatus(true) on status=read', async () => {
    const res = await readStatusPOST(
      postRequest('http://x/api/read-status', {
        paperId: 'arxiv:1',
        status: 'read',
      }),
    )
    expect(res.status).toBe(200)
    expect(setReadStatus).toHaveBeenCalledWith('arxiv:1', true)
  })

  it('returns 200 and calls setReadStatus(false) on status=unread', async () => {
    const res = await readStatusPOST(
      postRequest('http://x/api/read-status', {
        paperId: 'arxiv:1',
        status: 'unread',
      }),
    )
    expect(res.status).toBe(200)
    expect(setReadStatus).toHaveBeenCalledWith('arxiv:1', false)
  })

  it('rejects schema enum values not in the A6 binary set (reading, archived)', async () => {
    const res = await readStatusPOST(
      postRequest('http://x/api/read-status', {
        paperId: 'arxiv:1',
        status: 'reading',
      }),
    )
    expect(res.status).toBe(400)
    expect(setReadStatus).not.toHaveBeenCalled()
  })

  it('returns 400 on unknown status value', async () => {
    const res = await readStatusPOST(
      postRequest('http://x/api/read-status', {
        paperId: 'arxiv:1',
        status: 'maybe',
      }),
    )
    expect(res.status).toBe(400)
    expect(setReadStatus).not.toHaveBeenCalled()
  })
})
