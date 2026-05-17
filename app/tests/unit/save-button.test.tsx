// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'

// next/navigation's useRouter throws outside the App Router; stub it.
const refreshSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn(), replace: vi.fn() }),
}))

import { SaveButton } from '@/components/paper-actions/SaveButton'

describe('SaveButton', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    refreshSpy.mockClear()
    fetchSpy = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders aria-pressed=false when initialSaved is false', () => {
    const { getByRole } = render(<SaveButton paperId="arxiv:1" initialSaved={false} />)
    const button = getByRole('button', { name: /save paper/i })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('renders aria-pressed=true when initialSaved is true', () => {
    const { getByRole } = render(<SaveButton paperId="arxiv:1" initialSaved={true} />)
    const button = getByRole('button', { name: /unsave paper/i })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('flips aria-pressed on click and POSTs { saved: true }', async () => {
    const { getByRole } = render(<SaveButton paperId="arxiv:42" initialSaved={false} />)
    fireEvent.click(getByRole('button'))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/saves',
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body).toEqual({ paperId: 'arxiv:42', saved: true })
    await waitFor(() => {
      expect(getByRole('button').getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('reverts aria-pressed when fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { getByRole } = render(<SaveButton paperId="arxiv:1" initialSaved={false} />)
    fireEvent.click(getByRole('button'))
    // Optimistic flip
    await waitFor(() => expect(getByRole('button').getAttribute('aria-pressed')).toBe('true'))
    // Then revert
    await waitFor(() => expect(getByRole('button').getAttribute('aria-pressed')).toBe('false'))
    consoleSpy.mockRestore()
  })

  it('calls router.refresh after a successful save so server components re-render', async () => {
    const { getByRole } = render(<SaveButton paperId="arxiv:1" initialSaved={false} />)
    fireEvent.click(getByRole('button'))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
  })
})
