// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseFilterParams, serialiseFilters } from '@/lib/filters/parse'
import { EMPTY_FILTERS, type FilterState } from '@/types/filter'

function params(input: string | Record<string, string>): URLSearchParams {
  return new URLSearchParams(input)
}

describe('parseFilterParams', () => {
  it('returns EMPTY_FILTERS for empty params', () => {
    expect(parseFilterParams(params(''))).toEqual(EMPTY_FILTERS)
  })

  it('parses CSV source list', () => {
    const result = parseFilterParams(params('source=arxiv,cvf'))
    expect(result.sources).toEqual(['arxiv', 'cvf'])
  })

  it('parses CSV venueType list', () => {
    const result = parseFilterParams(params('venueType=conference,workshop'))
    expect(result.venueTypes).toEqual(['conference', 'workshop'])
  })

  it('parses tags + hasCode together', () => {
    const result = parseFilterParams(params('tag=localization,deepfake&hasCode=1'))
    expect(result.tags).toEqual(['localization', 'deepfake'])
    expect(result.hasCode).toBe(true)
  })

  it('parses sort=relevance', () => {
    expect(parseFilterParams(params('sort=relevance')).sortBy).toBe('relevance')
  })

  it('parses explicit sort=newest distinct from absent (tri-state)', () => {
    expect(parseFilterParams(params('sort=newest')).sortBy).toBe('newest')
    expect(parseFilterParams(params('')).sortBy).toBeNull()
  })

  it('falls back to null for invalid sort (same as absent)', () => {
    expect(parseFilterParams(params('sort=invalid')).sortBy).toBeNull()
  })

  it('parses search query', () => {
    expect(parseFilterParams(params('q=forgery')).searchQuery).toBe('forgery')
  })

  it('drops empty q (parses to null)', () => {
    expect(parseFilterParams(params('q=')).searchQuery).toBeNull()
  })

  it('drops whitespace-only q', () => {
    expect(parseFilterParams(params('q=%20%20')).searchQuery).toBeNull()
  })

  it('normalises q whitespace', () => {
    expect(parseFilterParams(params('q=copy%20%20move')).searchQuery).toBe('copy move')
  })

  it('drops unknown source values silently', () => {
    const result = parseFilterParams(params('source=bogus,arxiv'))
    expect(result.sources).toEqual(['arxiv'])
  })

  it('drops non-numeric year values', () => {
    const result = parseFilterParams(params('year=2024,abc,2025'))
    expect(result.years).toEqual([2024, 2025])
  })

  it('drops unknown tag values silently', () => {
    const result = parseFilterParams(params('tag=invented-tag,localization'))
    expect(result.tags).toEqual(['localization'])
  })

  it('parses hasCode=0 as false (distinct from absent → null)', () => {
    expect(parseFilterParams(params('hasCode=0')).hasCode).toBe(false)
    expect(parseFilterParams(params('hasCode=1')).hasCode).toBe(true)
    expect(parseFilterParams(params('')).hasCode).toBeNull()
  })

  it('treats hasCode=garbage as null', () => {
    expect(parseFilterParams(params('hasCode=maybe')).hasCode).toBeNull()
  })

  it('drops invalid venueType silently', () => {
    const result = parseFilterParams(params('venueType=unknown,conference'))
    expect(result.venueTypes).toEqual(['conference'])
  })

  it('parses domain=deepfake', () => {
    expect(parseFilterParams(params('domain=deepfake')).domain).toBe('deepfake')
  })

  it('defaults domain to forgery when absent', () => {
    expect(parseFilterParams(params('')).domain).toBe('forgery')
  })

  it('defaults domain to forgery for an unknown value', () => {
    expect(parseFilterParams(params('domain=faces')).domain).toBe('forgery')
  })
})

describe('serialiseFilters', () => {
  it('serialises EMPTY_FILTERS to empty string with no hasCode key', () => {
    const s = serialiseFilters(EMPTY_FILTERS).toString()
    expect(s).toBe('')
    expect(s).not.toMatch(/hasCode/)
  })

  it('omits empty arrays', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, sources: [] }).toString()
    expect(s).not.toMatch(/source/)
  })

  it('serialises non-empty arrays as CSV', () => {
    const s = serialiseFilters({
      ...EMPTY_FILTERS,
      sources: ['arxiv', 'cvf'],
    }).toString()
    expect(s).toBe('source=arxiv%2Ccvf')
  })

  it('serialises hasCode=true as 1', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, hasCode: true }).toString()
    expect(s).toBe('hasCode=1')
  })

  it('serialises hasCode=false as 0', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, hasCode: false }).toString()
    expect(s).toBe('hasCode=0')
  })

  it('omits sort when null (no explicit user choice)', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, sortBy: null }).toString()
    expect(s).not.toMatch(/sort/)
  })

  it('serialises explicit sort=newest (user chose newest, preserves intent)', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, sortBy: 'newest' }).toString()
    expect(s).toBe('sort=newest')
  })

  it('serialises sort=relevance', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, sortBy: 'relevance' }).toString()
    expect(s).toBe('sort=relevance')
  })

  it('omits q when null', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, searchQuery: null }).toString()
    expect(s).not.toMatch(/(^|&)q=/)
  })

  it('serialises q when present', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, searchQuery: 'forgery' }).toString()
    expect(s).toBe('q=forgery')
  })

  it('encodes special characters in q', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, searchQuery: 'copy move' }).toString()
    expect(s).toBe('q=copy+move')
  })

  it('omits domain when it is the default (forgery)', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, domain: 'forgery' }).toString()
    expect(s).not.toMatch(/domain/)
  })

  it('serialises domain=deepfake when non-default', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, domain: 'deepfake' }).toString()
    expect(s).toBe('domain=deepfake')
  })
})

describe('round-trip', () => {
  const cases: FilterState[] = [
    EMPTY_FILTERS,
    { ...EMPTY_FILTERS, sources: ['arxiv'] },
    { ...EMPTY_FILTERS, sources: ['arxiv', 'cvf', 'openreview'] },
    { ...EMPTY_FILTERS, venueTypes: ['conference'] },
    { ...EMPTY_FILTERS, years: [2024, 2025] },
    { ...EMPTY_FILTERS, tags: ['localization', 'deepfake'] },
    { ...EMPTY_FILTERS, hasCode: true },
    { ...EMPTY_FILTERS, hasCode: false },
    { ...EMPTY_FILTERS, sortBy: 'relevance' },
    { ...EMPTY_FILTERS, sortBy: 'newest' },
    { ...EMPTY_FILTERS, searchQuery: 'forgery' },
    { ...EMPTY_FILTERS, searchQuery: 'copy move detection' },
    { ...EMPTY_FILTERS, domain: 'deepfake' },
    { ...EMPTY_FILTERS, domain: 'deepfake', tags: ['deepfake'], searchQuery: 'face swap' },
    {
      sources: ['arxiv', 'cvf'],
      venueTypes: ['conference'],
      years: [2024, 2025],
      tags: ['localization'],
      hasCode: true,
      sortBy: 'relevance',
      searchQuery: null,
      domain: 'forgery',
    },
    {
      sources: ['arxiv'],
      venueTypes: [],
      years: [],
      tags: [],
      hasCode: null,
      sortBy: null,
      searchQuery: 'forgery localization',
      domain: 'deepfake',
    },
  ]

  it.each(cases)('round-trips state %#', (state) => {
    const serialised = serialiseFilters(state)
    const parsed = parseFilterParams(serialised)
    expect(parsed).toEqual(state)
  })
})
