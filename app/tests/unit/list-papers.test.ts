// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildListPapersQuery } from '@/lib/db/queries/list-papers-query'
import { EMPTY_FILTERS, type FilterState } from '@/types/filter'

function with_(overrides: Partial<FilterState>): FilterState {
  return { ...EMPTY_FILTERS, ...overrides }
}

describe('buildListPapersQuery — WHERE clause', () => {
  it('applies minRelevance gate by default', () => {
    const { sql, params } = buildListPapersQuery({ filters: EMPTY_FILTERS, minRelevance: 0.2 })
    expect(sql).toMatch(/relevance_score/)
    expect(params).toContain(0.2)
  })

  it('adds since constraint when provided', () => {
    const since = new Date('2025-01-01T00:00:00Z')
    const { sql, params } = buildListPapersQuery({
      filters: EMPTY_FILTERS,
      minRelevance: 0,
      since,
    })
    expect(sql).toMatch(/published_date/)
    expect(params).toContain(since.toISOString())
  })

  it('filters by sources via inArray', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({ sources: ['arxiv', 'cvf'] }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/primary_source/)
    expect(params).toEqual(expect.arrayContaining(['arxiv', 'cvf']))
  })

  it('filters by venueTypes via inArray', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({ venueTypes: ['conference'] }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/venue_type/)
    expect(params).toContain('conference')
  })

  it('filters by years via inArray', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({ years: [2024, 2025] }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/"year"/)
    expect(params).toEqual(expect.arrayContaining([2024, 2025]))
  })

  it('filters by tags using jsonb ?| operator (NOT && or arrayOverlaps)', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({ tags: ['localization', 'deepfake'] }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/\?\|/)
    expect(sql).not.toMatch(/&&/)
    expect(params).toEqual(expect.arrayContaining(['localization', 'deepfake']))
  })

  it('filters hasCode=true with IS NOT NULL', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ hasCode: true }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/code_url/)
    expect(sql).toMatch(/is not null/i)
  })

  it('filters hasCode=false with IS NULL', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ hasCode: false }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/code_url/)
    expect(sql).toMatch(/is null/i)
    expect(sql).not.toMatch(/is not null/i)
  })

  it('skips hasCode constraint when null', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ hasCode: null }),
      minRelevance: 0,
    })
    expect(sql).not.toMatch(/code_url/)
  })

  it('combines multiple filters with AND', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({
        sources: ['arxiv'],
        tags: ['localization'],
        hasCode: true,
      }),
      minRelevance: 0.2,
    })
    expect(sql).toMatch(/primary_source/)
    expect(sql).toMatch(/\?\|/)
    expect(sql).toMatch(/code_url/)
    expect(params).toContain('arxiv')
    expect(params).toContain('localization')
    expect(params).toContain(0.2)
  })
})

describe('buildListPapersQuery — ORDER BY', () => {
  it('defaults to published_date desc when sortBy=newest', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ sortBy: 'newest' }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/order by .*published_date/i)
  })

  it('orders by relevance_score desc, then published_date desc when sortBy=relevance', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ sortBy: 'relevance' }),
      minRelevance: 0,
    })
    const orderClause = sql.match(/order by[^l]*$/i)?.[0] ?? sql
    const relIdx = orderClause.search(/relevance_score/)
    const dateIdx = orderClause.search(/published_date/)
    expect(relIdx).toBeGreaterThanOrEqual(0)
    expect(dateIdx).toBeGreaterThan(relIdx)
  })
})

describe('buildListPapersQuery — LIMIT', () => {
  it('clamps limit to MAX_FEED_LIMIT (200)', () => {
    const { params } = buildListPapersQuery({
      filters: EMPTY_FILTERS,
      minRelevance: 0,
      limit: 9999,
    })
    expect(params).toContain(200)
  })

  it('clamps limit to minimum 1', () => {
    const { params } = buildListPapersQuery({
      filters: EMPTY_FILTERS,
      minRelevance: 0,
      limit: 0,
    })
    expect(params).toContain(1)
  })

  it('uses default limit 50 when unspecified', () => {
    const { params } = buildListPapersQuery({
      filters: EMPTY_FILTERS,
      minRelevance: 0,
    })
    expect(params).toContain(50)
  })
})
