'use client'

import { useId, useState, useTransition, type ChangeEvent, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'

interface ReadToggleProps {
  paperId: string
  initialRead: boolean
}

// Native checkbox for free keyboard a11y (space toggles, Tab focuses).
// Same optimistic + revert-on-failure pattern as SaveButton.
export function ReadToggle({ paperId, initialRead }: ReadToggleProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [read, setRead] = useState<boolean>(initialRead)
  const inputId = useId()

  async function persist(next: boolean): Promise<void> {
    const response = await fetch('/api/read-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paperId, status: next ? 'read' : 'unread' }),
    })
    if (!response.ok) {
      throw new Error(`read-status failed: HTTP ${response.status}`)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    if (isPending) {
      event.preventDefault()
      return
    }
    const next = event.target.checked
    const previous = read
    setRead(next)
    startTransition(() => {
      persist(next)
        .then(() => router.refresh())
        .catch((error: unknown) => {
          console.error('[ReadToggle] revert', error)
          setRead(previous)
        })
    })
  }

  // Click bubbling: the surrounding PaperCard title is a link. The label
  // wrapper passes clicks to the input which already handles them, but the
  // label itself sits next to the link — stop propagation so the label
  // text never triggers a PDF open by accident.
  function stopBubble(event: MouseEvent<HTMLLabelElement>): void {
    event.stopPropagation()
  }

  return (
    <label className="paper-action read-toggle" htmlFor={inputId} onClick={stopBubble}>
      <input
        id={inputId}
        type="checkbox"
        className="read-toggle-input"
        checked={read}
        onChange={handleChange}
        disabled={isPending}
      />
      <span className="paper-action-label">{read ? 'Read' : 'Mark read'}</span>
    </label>
  )
}
