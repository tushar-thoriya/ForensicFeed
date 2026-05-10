import type { Tag } from '@/lib/ingestion/tagger'
import type { PaperSource, VenueType } from './paper'

export type SortBy = 'newest' | 'relevance'

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
}

export const EMPTY_FILTERS: FilterState = {
  sources: [],
  venueTypes: [],
  years: [],
  tags: [],
  hasCode: null,
  sortBy: 'newest',
}

// Note: a non-default sort order counts as "filtered" so a zero-result
// view triggers the "no matches" empty state (with clear-filters CTA)
// rather than the "no papers ingested yet" copy. Sort is technically
// ordering, not subsetting, but combining the two states keeps the UX
// honest when the user changes both at once.
export function isFiltered(state: FilterState): boolean {
  return (
    state.sources.length > 0 ||
    state.venueTypes.length > 0 ||
    state.years.length > 0 ||
    state.tags.length > 0 ||
    state.hasCode !== null ||
    state.sortBy !== 'newest'
  )
}
