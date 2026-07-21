import { TAG_ORDER, type Tag } from '@/lib/ingestion/tagger'
import { SOURCE_VALUES, VENUE_TYPE_VALUES } from '@/lib/filters/labels'
import { parseSearchQuery } from '@/lib/search/parse-query'
import { type FilterState, type SortBy } from '@/types/filter'
import type { PaperDomain } from '@/types/paper'

const EXPLICIT_SORT_VALUES = ['newest', 'relevance'] as const

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

// 'forgery' is the default view, so anything other than an explicit
// 'deepfake' (absent, unknown, or 'forgery' itself) resolves to 'forgery'.
function parseDomain(value: string | null): PaperDomain {
  return value === 'deepfake' ? 'deepfake' : 'forgery'
}

// Tri-state: absent param OR unrecognised value → null (no explicit choice);
// explicit 'newest' or 'relevance' parses to that string. The distinction
// matters because when searching with sortBy=null we default to ts_rank_cd;
// with sortBy='newest' (user clicked the radio) we respect the user choice.
function parseSort(value: string | null): SortBy {
  if (value && (EXPLICIT_SORT_VALUES as readonly string[]).includes(value)) {
    return value as Exclude<SortBy, null>
  }
  return null
}

export function parseFilterParams(params: URLSearchParams): FilterState {
  return {
    sources: intersect(csv(params.get('source')), SOURCE_VALUES),
    venueTypes: intersect(csv(params.get('venueType')), VENUE_TYPE_VALUES),
    years: parseYears(csv(params.get('year'))),
    tags: intersect(csv(params.get('tag')), TAG_ORDER) as Tag[],
    hasCode: parseHasCode(params.get('hasCode')),
    sortBy: parseSort(params.get('sort')),
    searchQuery: parseSearchQuery(params.get('q')),
    domain: parseDomain(params.get('domain')),
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
  // sortBy: explicit values write; null omits the param.
  if (state.sortBy !== null) out.set('sort', state.sortBy)
  // searchQuery: re-parse before writing so we never emit empty / whitespace-only
  // q values into the URL even if the caller passed one accidentally.
  const normalised = parseSearchQuery(state.searchQuery)
  if (normalised !== null) out.set('q', normalised)
  // domain: only the non-default 'deepfake' writes a param; 'forgery' omits it
  // so the default feed URL stays clean and round-trips (like sortBy=null).
  if (state.domain !== 'forgery') out.set('domain', state.domain)
  return out
}
