'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { StatusScreen } from '@/components/status/StatusScreen'
import '@/components/status/status-screen.css'

interface FeedErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function FeedError({ error, reset }: FeedErrorProps) {
  useEffect(() => {
    console.error('[error boundary]', error)
  }, [error])

  return (
    <StatusScreen
      eyebrow="something went wrong"
      title="The feed didn’t load"
      message="A connection or server issue stopped this page from loading. Try again — if it keeps happening, the next ingest run will refresh the data."
    >
      <button type="button" className="status-screen-button" onClick={() => reset()}>
        Try again
      </button>
      <Link href="/" className="status-screen-link">
        Back to feed
      </Link>
    </StatusScreen>
  )
}
