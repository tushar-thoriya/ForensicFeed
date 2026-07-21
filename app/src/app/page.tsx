import { getFilterFacets, listRecentPapers } from '@/lib/db/queries/papers'
import type { PaperWithUserState } from '@/types/paper'
import { PaperList } from '@/components/feed/PaperList'
import { EmptyState } from '@/components/feed/EmptyState'
import { FilterPanel } from '@/components/filters/FilterPanel'
import { FilterChipsBar } from '@/components/filters/FilterChipsBar'
import { SearchInput } from '@/components/search/SearchInput'
import { FeedNav } from '@/components/nav/FeedNav'
import { DomainTabs } from '@/components/nav/DomainTabs'
import { parseFilterParams, serialiseFilters } from '@/lib/filters/parse'
import { isFiltered, type FilterState } from '@/types/filter'
import '@/components/feed/feed.css'
import '@/components/filters/filters.css'
import '@/components/search/search.css'
import '@/components/paper-actions/paper-actions.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RESULT_STATUS_ID = 'feed-result-status'

interface FeedPageProps {
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
  return cleared.length === 0 ? '/' : `/?${cleared}`
}

function sortLabel(filters: FilterState): string {
  if (filters.sortBy === 'relevance') return 'most relevant'
  if (filters.searchQuery !== null && filters.sortBy === null) return 'ranked by match'
  return 'newest first'
}

const SUBTITLE: Record<FilterState['domain'], string> = {
  forgery:
    'Open-access research on image forgery detection and localization — tracked so nothing slips past.',
  deepfake:
    'Deepfake, face-swap, and synthetic-face detection research — tracked alongside the forgery feed.',
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const resolved = await searchParams
  const filters: FilterState = parseFilterParams(paramsToURLSearchParams(resolved))

  let papers: PaperWithUserState[] = []
  let facets = { sources: [], venueTypes: [], years: [] } as Awaited<
    ReturnType<typeof getFilterFacets>
  >
  let errorMessage: string | null = null

  try {
    ;[papers, facets] = await Promise.all([
      listRecentPapers({ filters, limit: 50, minRelevance: 0.2 }),
      getFilterFacets(filters.domain),
    ])
  } catch (error) {
    // Log full error context server-side; never reflect raw DB / connection
    // detail to the client (could leak host/port/query fragments).
    console.error('[FeedPage] listRecentPapers/getFilterFacets failed', error)
    errorMessage = 'Failed to load papers'
  }

  const filtered = isFiltered(filters)
  const searching = filters.searchQuery !== null
  const emptyVariant: 'no-papers' | 'no-matches' | 'no-search-matches' = searching
    ? 'no-search-matches'
    : filtered
      ? 'no-matches'
      : 'no-papers'

  // Split text: liveCount is the only piece announced by screen readers
  // (avoids re-announcing the full query echo on every keystroke);
  // contextSuffix is visible-only so sighted users still see the query.
  const liveCount = searching
    ? `${papers.length} ${papers.length === 1 ? 'result' : 'results'}`
    : `${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}`
  const contextSuffix = searching
    ? ` for “${filters.searchQuery}” · ${sortLabel(filters)}`
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
          <FeedNav current="feed" />
          <p className="feed-eyebrow">the feed</p>
          <h1 className="feed-title">ForensicFeed</h1>
          <p className="feed-subtitle">{SUBTITLE[filters.domain]}</p>
          <DomainTabs filters={filters} />
          <SearchInput initialValue={filters.searchQuery ?? ''} resultStatusId={RESULT_STATUS_ID} />
          <p id={RESULT_STATUS_ID} className="feed-meta">
            <span aria-live="polite" role="status">
              {errorMessage ? 'connection issue' : liveCount}
            </span>
            {!errorMessage && <span>{contextSuffix}</span>}
          </p>
          {!errorMessage && <FilterChipsBar filters={filters} />}
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
