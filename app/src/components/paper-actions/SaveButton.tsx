'use client'

import { useState, useTransition, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'

interface SaveButtonProps {
  paperId: string
  initialSaved: boolean
}

// Optimistic save toggle. Click flips the local state immediately; if the
// POST fails we revert to the prior state so the visual matches the
// (unchanged) server truth. Pending state disables the button so a rapid
// double-click can't desync local UI from server.
//
// stopPropagation: PaperCard's title is a link. Without this, clicking the
// bookmark would also open the PDF in a new tab.
export function SaveButton({ paperId, initialSaved }: SaveButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState<boolean>(initialSaved)

  async function persist(next: boolean): Promise<void> {
    const response = await fetch('/api/saves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paperId, saved: next }),
    })
    if (!response.ok) {
      throw new Error(`save failed: HTTP ${response.status}`)
    }
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation()
    event.preventDefault()
    if (isPending) return
    const next = !saved
    const previous = saved
    setSaved(next)
    startTransition(() => {
      persist(next)
        .then(() => {
          // Refresh the server component so /saved counts and route-level
          // empty states see the new state without a hard reload.
          router.refresh()
        })
        .catch((error: unknown) => {
          console.error('[SaveButton] revert', error)
          setSaved(previous)
        })
    })
  }

  return (
    <button
      type="button"
      className={`paper-action save-button${saved ? ' save-button-saved' : ''}`}
      aria-pressed={saved}
      aria-label={saved ? 'Unsave paper' : 'Save paper'}
      onClick={handleClick}
      disabled={isPending}
    >
      <svg
        className="save-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M6 3h12v18l-6-4-6 4V3z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span className="paper-action-label">{saved ? 'Saved' : 'Save'}</span>
    </button>
  )
}
