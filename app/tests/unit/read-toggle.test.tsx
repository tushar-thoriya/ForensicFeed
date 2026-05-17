// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'

const refreshSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn(), replace: vi.fn() }),
}))

import { ReadToggle } from '@/components/paper-actions/ReadToggle'

describe('ReadToggle', () => {
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

  it('renders unchecked when initialRead is false', () => {
    const { getByRole } = render(<ReadToggle paperId="arxiv:1" initialRead={false} />)
    const checkbox = getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('renders checked when initialRead is true', () => {
    const { getByRole } = render(<ReadToggle paperId="arxiv:1" initialRead={true} />)
    const checkbox = getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('POSTs { status: "read" } when checked', async () => {
    const { getByRole } = render(<ReadToggle paperId="arxiv:9" initialRead={false} />)
    const checkbox = getByRole('checkbox') as HTMLInputElement
    fireEvent.click(checkbox)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/read-status', expect.any(Object)))
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ paperId: 'arxiv:9', status: 'read' })
  })

  it('POSTs { status: "unread" } when unchecked', async () => {
    const { getByRole } = render(<ReadToggle paperId="arxiv:9" initialRead={true} />)
    const checkbox = getByRole('checkbox') as HTMLInputElement
    fireEvent.click(checkbox)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ paperId: 'arxiv:9', status: 'unread' })
  })

  it('reverts checkbox state when fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { getByRole } = render(<ReadToggle paperId="arxiv:1" initialRead={false} />)
    const checkbox = getByRole('checkbox') as HTMLInputElement
    fireEvent.click(checkbox)
    // Optimistic check
    await waitFor(() => expect(checkbox.checked).toBe(true))
    // Then revert
    await waitFor(() => expect(checkbox.checked).toBe(false))
    consoleSpy.mockRestore()
  })

  it('calls router.refresh after a successful toggle', async () => {
    const { getByRole } = render(<ReadToggle paperId="arxiv:1" initialRead={false} />)
    fireEvent.click(getByRole('checkbox'))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
  })
})
