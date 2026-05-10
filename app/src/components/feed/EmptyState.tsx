import Link from 'next/link'

export type EmptyStateVariant = 'no-papers' | 'no-matches'

interface EmptyStateProps {
  variant: EmptyStateVariant
}

export function EmptyState({ variant }: EmptyStateProps) {
  if (variant === 'no-matches') {
    return (
      <div className="empty-state">
        <p>No papers match these filters.</p>
        <Link href="/" className="empty-state-link">
          Clear filters
        </Link>
      </div>
    )
  }

  return (
    <div className="empty-state">
      <p>No papers ingested yet — check back after the next ingest run.</p>
    </div>
  )
}
