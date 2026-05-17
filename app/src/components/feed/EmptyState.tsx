import Link from 'next/link'

export type EmptyStateVariant =
  | 'no-papers'
  | 'no-matches'
  | 'no-search-matches'
  | 'nothing-saved'

interface EmptyStateProps {
  variant: EmptyStateVariant
  query?: string | null
  clearSearchHref?: string
}

export function EmptyState({ variant, query, clearSearchHref = '/' }: EmptyStateProps) {
  if (variant === 'no-search-matches') {
    return (
      <div className="empty-state">
        <p>
          No papers match <strong>“{query ?? ''}”</strong>.
        </p>
        <Link href={clearSearchHref} className="empty-state-link">
          Clear search
        </Link>
      </div>
    )
  }

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

  if (variant === 'nothing-saved') {
    return (
      <div className="empty-state">
        <p>Nothing saved yet. Tap the bookmark on any paper to keep it here.</p>
        <Link href="/" className="empty-state-link">
          Browse the feed
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
