import Link from 'next/link'
import { StatusScreen } from '@/components/status/StatusScreen'
import '@/components/status/status-screen.css'

export default function PaperNotFound() {
  return (
    <StatusScreen
      eyebrow="404 — paper not found"
      title="This paper isn’t here"
      message="The paper you’re looking for doesn’t exist or hasn’t been ingested. It may have been removed, or the link is out of date."
    >
      <Link href="/" className="status-screen-link">
        Back to feed
      </Link>
    </StatusScreen>
  )
}
