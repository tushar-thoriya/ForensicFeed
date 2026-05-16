import type { Tag } from '@/lib/ingestion/tagger'
import type { PaperSource, VenueType } from './paper'

// Tri-state: null means "no explicit sort param in URL". Required so we can
// default to ts_rank_cd when searching without overriding a user who clicked
// the "Newest" radio. Explicit 'newest' is a user choice and serialises
// to `sort=newest`; null serialises to no `sort` param at all.
export type SortBy = 'newest' | 'relevance' | null

export type FilterDimension = 'source' | 'venueType' | 'year' | 'tag' | 'hasCode'

export type RemoveFilterArgs =
  | { dimension: 'source'; value: PaperSource }
  | { dimension: 'venueType'; value: VenueType }
  | { dimension: 'year'; value: number }
  | { dimension: 'tag'; value: Tag }
  | { dimension: 'hasCode'; value: null }

export interface FilterState {
  sources: PaperSource[]
  venueTypes: VenueType[]
  years: number[]
  tags: Tag[]
  hasCode: boolean | null
  sortBy: SortBy
  searchQuery: string | null
}

export const EMPTY_FILTERS: FilterState = {
  sources: [],
  venueTypes: [],
  years: [],
  tags: [],
  hasCode: null,
  sortBy: null,
  searchQuery: null,
}

// A non-default sort order or a search query counts as "filtered" so a
// zero-result view triggers the "no matches" (or "no search matches")
// empty state with a clear CTA, rather than the "no papers ingested yet"
// copy.
export function isFiltered(state: FilterState): boolean {
  return (
    state.sources.length > 0 ||
    state.venueTypes.length > 0 ||
    state.years.length > 0 ||
    state.tags.length > 0 ||
    state.hasCode !== null ||
    state.sortBy !== null ||
    state.searchQuery !== null
  )
}
