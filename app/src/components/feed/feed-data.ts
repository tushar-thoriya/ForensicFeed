import { type FilterFacets } from '@/lib/db/queries/papers'
import { getCachedFeedFacets, getCachedFeedPapers } from '@/lib/db/queries/feed-cache'
import type { PaperWithUserState } from '@/types/paper'
import type { FilterState } from '@/types/filter'

const FEED_LIMIT = 50
const MIN_RELEVANCE = 0.2
const EMPTY_FACETS: FilterFacets = { sources: [], venueTypes: [], years: [] }

export interface FeedData {
  papers: PaperWithUserState[]
  facets: FilterFacets
  errorMessage: string | null
}

// Single fetch shared by every streamed feed section (sidebar, result count,
// paper list). Called WITHOUT awaiting in the page so the header/tabs render
// immediately; each <Suspense> section awaits this same promise and React
// dedupes to one round-trip. Errors are caught here — never rejected — so the
// sections branch on `errorMessage` instead of tripping an error boundary.
export async function loadFeedData(filters: FilterState): Promise<FeedData> {
  try {
    const [papers, facets] = await Promise.all([
      getCachedFeedPapers(filters, FEED_LIMIT, MIN_RELEVANCE),
      getCachedFeedFacets(filters.domain),
    ])
    return { papers, facets, errorMessage: null }
  } catch (error) {
    // Log full context server-side; never reflect raw DB/connection detail to
    // the client (could leak host/port/query fragments).
    console.error('[FeedPage] loadFeedData failed', error)
    return { papers: [], facets: EMPTY_FACETS, errorMessage: 'Failed to load papers' }
  }
}
