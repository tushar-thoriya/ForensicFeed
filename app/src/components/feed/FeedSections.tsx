import { FilterPanel } from '@/components/filters/FilterPanel'
import { PaperList } from '@/components/feed/PaperList'
import { EmptyState } from '@/components/feed/EmptyState'
import { serialiseFilters } from '@/lib/filters/parse'
import { isFiltered, type FilterState } from '@/types/filter'
import type { FeedData } from './feed-data'

// These sections each await the SAME loadFeedData promise inside their own
// <Suspense> boundary. The page header (title, domain tabs, search) renders
// synchronously above them, so switching tabs updates the shell instantly
// while only these regions show a skeleton and stream in.

function sortLabel(filters: FilterState): string {
  if (filters.sortBy === 'relevance') return 'most relevant'
  if (filters.searchQuery !== null && filters.sortBy === null) return 'ranked by match'
  return 'newest first'
}

function clearSearchHref(filters: FilterState): string {
  const cleared = serialiseFilters({ ...filters, searchQuery: null }).toString()
  return cleared.length === 0 ? '/' : `/?${cleared}`
}

interface SectionProps {
  dataPromise: Promise<FeedData>
  filters: FilterState
}

export async function FeedSidebar({ dataPromise, filters }: SectionProps) {
  const { facets, errorMessage } = await dataPromise
  // Match prior behaviour: hide the sidebar entirely when the feed failed to
  // load — there are no facets to offer.
  if (errorMessage) return null
  return (
    <FilterPanel
      filters={filters}
      availableSources={facets.sources}
      availableVenueTypes={facets.venueTypes}
      availableYears={facets.years}
    />
  )
}

// Only the count number depends on DB data; it lives inside the shell's stable
// aria-live region so the result total is announced when it streams in.
export async function FeedResultCount({ dataPromise, filters }: SectionProps) {
  const { papers, errorMessage } = await dataPromise
  if (errorMessage) return <>connection issue</>
  const searching = filters.searchQuery !== null
  const noun = searching ? 'result' : 'paper'
  const label = papers.length === 1 ? noun : `${noun}s`
  return (
    <>
      {papers.length} {label}
    </>
  )
}

// The context suffix (query echo + sort label) is visible-only and derives
// from filters, but must hide when the feed errored — so it streams too.
export async function FeedResultContext({ dataPromise, filters }: SectionProps) {
  const { errorMessage } = await dataPromise
  if (errorMessage) return null
  const searching = filters.searchQuery !== null
  const contextSuffix = searching
    ? ` for “${filters.searchQuery}” · ${sortLabel(filters)}`
    : ` · ${sortLabel(filters)}`
  return <span>{contextSuffix}</span>
}

export async function FeedResults({ dataPromise, filters }: SectionProps) {
  const { papers, errorMessage } = await dataPromise

  if (errorMessage) {
    return (
      <div className="empty-state">
        <p>{errorMessage}</p>
      </div>
    )
  }

  const searching = filters.searchQuery !== null
  const filtered = isFiltered(filters)
  const emptyVariant: 'no-papers' | 'no-matches' | 'no-search-matches' = searching
    ? 'no-search-matches'
    : filtered
      ? 'no-matches'
      : 'no-papers'

  if (papers.length === 0) {
    return (
      <EmptyState
        variant={emptyVariant}
        query={filters.searchQuery}
        clearSearchHref={clearSearchHref(filters)}
      />
    )
  }

  return <PaperList papers={papers} />
}
