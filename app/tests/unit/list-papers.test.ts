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

  it('constrains to the forgery domain by default', () => {
    const { sql, params } = buildListPapersQuery({ filters: EMPTY_FILTERS, minRelevance: 0 })
    expect(sql).toMatch(/"domain"/)
    expect(params).toContain('forgery')
  })

  it('constrains to the deepfake domain when the tab is deepfake', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({ domain: 'deepfake' }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/"domain"/)
    expect(params).toContain('deepfake')
  })

  it('omits the domain constraint entirely when ignoreDomain is set', () => {
    const { sql } = buildListPapersQuery({
      filters: EMPTY_FILTERS,
      minRelevance: 0,
      ignoreDomain: true,
    })
    expect(sql).not.toMatch(/"domain"/)
  })
})

describe('buildListPapersQuery — ORDER BY', () => {
  it('defaults to published_date desc when sortBy=newest', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ sortBy: 'newest' }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/order by .*published_date/i)
    expect(sql).not.toMatch(/ts_rank_cd/i)
  })

  it('defaults to published_date desc when sortBy=null without search', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ sortBy: null }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/order by .*published_date/i)
    expect(sql).not.toMatch(/ts_rank_cd/i)
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

describe('buildListPapersQuery — full-text search', () => {
  it('does NOT include websearch_to_tsquery when searchQuery is null', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ searchQuery: null }),
      minRelevance: 0,
    })
    expect(sql).not.toMatch(/websearch_to_tsquery/i)
    expect(sql).not.toMatch(/search_vector/i)
  })

  it('adds search_vector @@ websearch_to_tsquery condition when searching', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({ searchQuery: 'forgery' }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/search_vector/i)
    expect(sql).toMatch(/websearch_to_tsquery/i)
    expect(sql).toMatch(/@@/)
    expect(params).toContain('forgery')
  })

  it('uses ts_rank_cd DESC in ORDER BY when searching with no explicit sort (sortBy=null)', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ searchQuery: 'forgery', sortBy: null }),
      minRelevance: 0,
    })
    expect(sql).toMatch(/ts_rank_cd/i)
    const orderClause = sql.match(/order by[\s\S]+?limit/i)?.[0] ?? ''
    // Regression guard: direction must be DESC — without it the highest-
    // ranked matches would sort last and search would feel broken.
    expect(orderClause).toMatch(/ts_rank_cd\(.*?\)\s+desc/i)
  })

  it('explicit sortBy=newest overrides ts_rank_cd default when searching', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ searchQuery: 'forgery', sortBy: 'newest' }),
      minRelevance: 0,
    })
    expect(sql).not.toMatch(/order by.*ts_rank_cd/i)
    expect(sql).toMatch(/order by .*published_date/i)
  })

  it('explicit sortBy=relevance overrides ts_rank_cd default when searching', () => {
    const { sql } = buildListPapersQuery({
      filters: with_({ searchQuery: 'forgery', sortBy: 'relevance' }),
      minRelevance: 0,
    })
    expect(sql).not.toMatch(/order by.*ts_rank_cd/i)
    expect(sql).toMatch(/relevance_score/i)
  })

  it('binds the query string param both in WHERE and ORDER BY when searching with sortBy=null', () => {
    // domain: 'deepfake' so the domain-condition param does not collide with
    // the 'forgery' search term we are counting here.
    const { params } = buildListPapersQuery({
      filters: with_({ searchQuery: 'forgery', sortBy: null, domain: 'deepfake' }),
      minRelevance: 0,
    })
    // The query string should appear twice: once for the WHERE @@ predicate,
    // once for the ORDER BY ts_rank_cd. (Triple-eval would be three: WHERE,
    // ORDER BY, and headline-SELECT — but headline lives in papers.ts, not
    // in the pure SQL builder, so we only see two here.)
    const occurrences = params.filter((p) => p === 'forgery').length
    expect(occurrences).toBe(2)
  })

  it('combines search with other filters using AND', () => {
    const { sql, params } = buildListPapersQuery({
      filters: with_({
        searchQuery: 'forgery',
        tags: ['localization'],
        hasCode: true,
      }),
      minRelevance: 0.2,
    })
    expect(sql).toMatch(/search_vector/i)
    expect(sql).toMatch(/\?\|/)
    expect(sql).toMatch(/code_url/i)
    expect(params).toContain('forgery')
    expect(params).toContain('localization')
    expect(params).toContain(0.2)
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
