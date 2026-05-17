import { listSavedPapers } from '@/lib/db/queries/saved-papers'
import { getFilterFacets } from '@/lib/db/queries/papers'
import type { PaperWithUserState } from '@/types/paper'
import { PaperList } from '@/components/feed/PaperList'
import { EmptyState } from '@/components/feed/EmptyState'
import { FilterPanel } from '@/components/filters/FilterPanel'
import { SearchInput } from '@/components/search/SearchInput'
import { FeedNav } from '@/components/nav/FeedNav'
import { parseFilterParams, serialiseFilters } from '@/lib/filters/parse'
import { isFiltered, type FilterState } from '@/types/filter'
import '@/components/feed/feed.css'
import '@/components/filters/filters.css'
import '@/components/search/search.css'
import '@/components/paper-actions/paper-actions.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RESULT_STATUS_ID = 'saved-result-status'

interface SavedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function paramsToURLSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v)
    } else {
      sp.append(key, value)
    }
  }
  return sp
}

function clearSearchHref(filters: FilterState): string {
  const cleared = serialiseFilters({ ...filters, searchQuery: null }).toString()
  return cleared.length === 0 ? '/saved' : `/saved?${cleared}`
}

function sortLabel(filters: FilterState): string {
  if (filters.sortBy === 'relevance') return 'most relevant'
  if (filters.sortBy === 'newest') return 'newest first'
  if (filters.searchQuery !== null) return 'ranked by match'
  // /saved default: save-recency (saved_at DESC)
  return 'recently saved first'
}

export default async function SavedPage({ searchParams }: SavedPageProps) {
  const resolved = await searchParams
  const filters: FilterState = parseFilterParams(paramsToURLSearchParams(resolved))

  let papers: PaperWithUserState[] = []
  let facets = { sources: [], venueTypes: [], years: [] } as Awaited<
    ReturnType<typeof getFilterFacets>
  >
  let errorMessage: string | null = null

  try {
    ;[papers, facets] = await Promise.all([
      listSavedPapers({ filters, limit: 50, minRelevance: 0 }),
      getFilterFacets(),
    ])
  } catch (error) {
    console.error('[SavedPage] listSavedPapers/getFilterFacets failed', error)
    errorMessage = 'Failed to load saved papers'
  }

  const filtered = isFiltered(filters)
  const searching = filters.searchQuery !== null

  // No saves at all when filters are inactive → "nothing saved yet".
  // Saves exist but filters/search exclude them → reuse the existing
  // no-matches / no-search-matches copy.
  const emptyVariant: 'nothing-saved' | 'no-matches' | 'no-search-matches' = searching
    ? 'no-search-matches'
    : filtered
      ? 'no-matches'
      : 'nothing-saved'

  const liveCount = `${papers.length} ${papers.length === 1 ? 'paper' : 'papers'} saved`
  const contextSuffix = searching
    ? ` matching “${filters.searchQuery}” · ${sortLabel(filters)}`
    : ` · ${sortLabel(filters)}`

  return (
    <main className="feed-with-sidebar">
      {!errorMessage && (
        <FilterPanel
          filters={filters}
          availableSources={facets.sources}
          availableVenueTypes={facets.venueTypes}
          availableYears={facets.years}
        />
      )}
      <div>
        <header className="feed-header">
          <FeedNav current="saved" />
          <h1 className="feed-title">Saved papers</h1>
          <p className="feed-subtitle">
            Papers you bookmarked, most recently saved first. Filters and search compose with
            this view.
          </p>
          <SearchInput
            initialValue={filters.searchQuery ?? ''}
            resultStatusId={RESULT_STATUS_ID}
          />
          <p id={RESULT_STATUS_ID} className="feed-meta">
            <span aria-live="polite" role="status">
              {errorMessage ? 'connection issue' : liveCount}
            </span>
            {!errorMessage && <span>{contextSuffix}</span>}
          </p>
        </header>
        {errorMessage ? (
          <div className="empty-state">
            <p>{errorMessage}</p>
          </div>
        ) : papers.length === 0 ? (
          <EmptyState
            variant={emptyVariant}
            query={filters.searchQuery}
            clearSearchHref={clearSearchHref(filters)}
          />
        ) : (
          <PaperList papers={papers} />
        )}
      </div>
    </main>
  )
}
