import { getFilterFacets, listRecentPapers } from '@/lib/db/queries/papers'
import type { Paper } from '@/lib/db/schema'
import { PaperList } from '@/components/feed/PaperList'
import { EmptyState } from '@/components/feed/EmptyState'
import { FilterPanel } from '@/components/filters/FilterPanel'
import { parseFilterParams } from '@/lib/filters/parse'
import { isFiltered, type FilterState } from '@/types/filter'
import '@/components/feed/feed.css'
import '@/components/filters/filters.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const resolved = await searchParams
  const filters: FilterState = parseFilterParams(paramsToURLSearchParams(resolved))

  let papers: Paper[] = []
  let facets = { sources: [], venueTypes: [], years: [] } as Awaited<
    ReturnType<typeof getFilterFacets>
  >
  let errorMessage: string | null = null

  try {
    ;[papers, facets] = await Promise.all([
      listRecentPapers({ filters, limit: 50, minRelevance: 0.2 }),
      getFilterFacets(),
    ])
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Failed to load papers'
  }

  const filtered = isFiltered(filters)
  const sortLabel = filters.sortBy === 'relevance' ? 'most relevant' : 'newest first'

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
          <h1 className="feed-title">ForensicFeed</h1>
          <p className="feed-subtitle">
            Open-access research on image forgery detection and localization — tracked so nothing
            slips past.
          </p>
          <p className="feed-meta" aria-live="polite" role="status">
            {errorMessage ? 'connection issue' : `${papers.length} papers · ${sortLabel}`}
          </p>
        </header>
        {errorMessage ? (
          <div className="empty-state">
            <p>{errorMessage}</p>
          </div>
        ) : papers.length === 0 ? (
          <EmptyState variant={filtered ? 'no-matches' : 'no-papers'} />
        ) : (
          <PaperList papers={papers} />
        )}
      </div>
    </main>
  )
}

