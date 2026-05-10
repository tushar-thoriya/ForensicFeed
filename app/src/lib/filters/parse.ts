import { TAG_ORDER, type Tag } from '@/lib/ingestion/tagger'
import { SOURCE_VALUES, VENUE_TYPE_VALUES } from '@/lib/filters/labels'
import { EMPTY_FILTERS, type FilterState, type SortBy } from '@/types/filter'

const SORT_VALUES: readonly SortBy[] = ['newest', 'relevance'] as const

function csv(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function intersect<T extends string>(input: string[], whitelist: readonly T[]): T[] {
  const allowed = new Set<string>(whitelist)
  return input.filter((v): v is T => allowed.has(v))
}

function parseYears(input: string[]): number[] {
  const out: number[] = []
  for (const v of input) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 1900 && n < 2100) out.push(n)
  }
  return out
}

function parseHasCode(value: string | null): boolean | null {
  if (value === '1') return true
  if (value === '0') return false
  return null
}

function parseSort(value: string | null): SortBy {
  if (value && (SORT_VALUES as readonly string[]).includes(value)) return value as SortBy
  return 'newest'
}

export function parseFilterParams(params: URLSearchParams): FilterState {
  return {
    sources: intersect(csv(params.get('source')), SOURCE_VALUES),
    venueTypes: intersect(csv(params.get('venueType')), VENUE_TYPE_VALUES),
    years: parseYears(csv(params.get('year'))),
    tags: intersect(csv(params.get('tag')), TAG_ORDER) as Tag[],
    hasCode: parseHasCode(params.get('hasCode')),
    sortBy: parseSort(params.get('sort')),
  }
}

export function serialiseFilters(state: FilterState): URLSearchParams {
  const out = new URLSearchParams()
  if (state.sources.length > 0) out.set('source', state.sources.join(','))
  if (state.venueTypes.length > 0) out.set('venueType', state.venueTypes.join(','))
  if (state.years.length > 0) out.set('year', state.years.join(','))
  if (state.tags.length > 0) out.set('tag', state.tags.join(','))
  if (state.hasCode === true) out.set('hasCode', '1')
  else if (state.hasCode === false) out.set('hasCode', '0')
  if (state.sortBy !== EMPTY_FILTERS.sortBy) out.set('sort', state.sortBy)
  return out
}
