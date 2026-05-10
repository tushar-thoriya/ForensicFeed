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

  it('falls back to newest for invalid sort', () => {
    expect(parseFilterParams(params('sort=invalid')).sortBy).toBe('newest')
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

  it('omits sort when default newest', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, sortBy: 'newest' }).toString()
    expect(s).not.toMatch(/sort/)
  })

  it('serialises sort=relevance when non-default', () => {
    const s = serialiseFilters({ ...EMPTY_FILTERS, sortBy: 'relevance' }).toString()
    expect(s).toBe('sort=relevance')
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
    {
      sources: ['arxiv', 'cvf'],
      venueTypes: ['conference'],
      years: [2024, 2025],
      tags: ['localization'],
      hasCode: true,
      sortBy: 'relevance',
    },
  ]

  it.each(cases)('round-trips state %#', (state) => {
    const serialised = serialiseFilters(state)
    const parsed = parseFilterParams(serialised)
    expect(parsed).toEqual(state)
  })
})
