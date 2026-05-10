'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, MouseEvent } from 'react'

interface FilterSheetProps {
  triggerLabel: string
  children: ReactNode
}

export function FilterSheet({ triggerLabel, children }: FilterSheetProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => setOpen(false)
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [])

  // Close when the user clicks the backdrop. The dialog occupies the full
  // viewport while ::backdrop is the area outside .filter-sheet-body — so a
  // click whose target is the dialog itself (not a descendant) is a backdrop
  // click.
  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="filter-sheet-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="filter-sheet"
        aria-labelledby={titleId}
        onClick={handleDialogClick}
      >
        <div className="filter-sheet-header">
          <h2 id={titleId} className="filter-sheet-title">
            Filters
          </h2>
          <button
            type="button"
            className="filter-sheet-close"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="filter-sheet-body">{open ? children : null}</div>
      </dialog>
    </>
  )
}
