import Link from 'next/link'

export type EmptyStateVariant = 'no-papers' | 'no-matches' | 'no-search-matches'

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

  return (
    <div className="empty-state">
      <p>No papers ingested yet — check back after the next ingest run.</p>
    </div>
  )
}
