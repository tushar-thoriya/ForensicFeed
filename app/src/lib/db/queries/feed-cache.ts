import { unstable_cache } from 'next/cache'
import { getFilterFacets, listRecentPapers, type FilterFacets } from '@/lib/db/queries/papers'
import type { PaperWithUserState, PaperDomain } from '@/types/paper'
import type { FilterState } from '@/types/filter'

// Single tag for the whole feed data cache. Invalidated by save/read mutations
// (so the feed's own badges stay correct) and at the end of an ingest run (so
// new papers surface). See revalidateTag('feed') call sites.
export const FEED_CACHE_TAG = 'feed'

// Time-based backstop only. Correctness comes from tag invalidation above;
// this just bounds staleness if a revalidate call is ever missed. Ingestion is
// daily/weekly, so an hour is comfortably fresh.
const FEED_CACHE_TTL_SECONDS = 3600

// The page renders with `force-dynamic`, but that governs route rendering, not
// the data cache — unstable_cache still persists these results across requests,
// which is the whole point: a Forgery⇄Deepfakes switch hits a warm cache entry
// instead of a fresh Supabase round-trip.
//
// The cache key is the keyParts array below PLUS the serialised arguments, so
// each (filters, limit, minRelevance) combination — and thus each tab, filter
// set, and search query — gets its own entry.
const getCachedFeedPapersRaw = unstable_cache(
  (filters: FilterState, limit: number, minRelevance: number): Promise<PaperWithUserState[]> =>
    listRecentPapers({ filters, limit, minRelevance }),
  ['feed-papers'],
  { tags: [FEED_CACHE_TAG], revalidate: FEED_CACHE_TTL_SECONDS },
)

// unstable_cache serialises its result into the data cache, so on a cache HIT
// the timestamp columns come back as ISO strings rather than Date objects —
// which breaks Date consumers like PaperCard's formatDate. Re-hydrate them here
// so the PaperWithUserState contract (real Dates) holds on both hit and miss.
// `new Date(x)` is a safe clone when x is already a Date (the miss path).
function reviveDates(paper: PaperWithUserState): PaperWithUserState {
  return {
    ...paper,
    publishedDate: new Date(paper.publishedDate),
    updatedDate: paper.updatedDate === null ? null : new Date(paper.updatedDate),
    createdAt: new Date(paper.createdAt),
  }
}

export async function getCachedFeedPapers(
  filters: FilterState,
  limit: number,
  minRelevance: number,
): Promise<PaperWithUserState[]> {
  const rows = await getCachedFeedPapersRaw(filters, limit, minRelevance)
  return rows.map(reviveDates)
}

export const getCachedFeedFacets = unstable_cache(
  (domain: PaperDomain): Promise<FilterFacets> => getFilterFacets(domain),
  ['feed-facets'],
  { tags: [FEED_CACHE_TAG], revalidate: FEED_CACHE_TTL_SECONDS },
)
