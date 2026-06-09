// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildDigestQuery,
  DIGEST_MAX_PAPERS,
  DIGEST_RELEVANCE_THRESHOLD,
} from '@/lib/db/queries/digest-query'

const SINCE = new Date('2026-06-02T00:00:00Z')

// Isolate the WHERE clause so ORDER BY columns (which also mention
// published_date) don't pollute regression assertions about the window column.
function whereClause(sql: string): string {
  return sql.match(/where[\s\S]+?order by/i)?.[0] ?? sql
}

function orderClause(sql: string): string {
  return sql.match(/order by[\s\S]+?limit/i)?.[0] ?? sql
}

describe('buildDigestQuery — WHERE clause', () => {
  it('applies the default relevance threshold gate', () => {
    const { sql, params } = buildDigestQuery({ since: SINCE })
    expect(sql).toMatch(/relevance_score/)
    expect(params).toContain(DIGEST_RELEVANCE_THRESHOLD)
    expect(DIGEST_RELEVANCE_THRESHOLD).toBe(0.2)
  })

  it('honours a custom threshold', () => {
    const { params } = buildDigestQuery({ since: SINCE, threshold: 0.5 })
    expect(params).toContain(0.5)
    expect(params).not.toContain(0.2)
  })

  it('constrains the window by created_at, bound to `since`', () => {
    const { sql, params } = buildDigestQuery({ since: SINCE })
    expect(whereClause(sql)).toMatch(/created_at/)
    expect(params).toContain(SINCE.toISOString())
  })

  it('keys the window off created_at, NOT published_date (regression)', () => {
    const { sql } = buildDigestQuery({ since: SINCE })
    // The digest must surface late-discovered papers, so the time window is
    // ingestion time (created_at), never publication time. published_date is
    // allowed in ORDER BY but must never appear in the WHERE filter.
    expect(whereClause(sql)).toMatch(/created_at/)
    expect(whereClause(sql)).not.toMatch(/published_date/)
  })
})

describe('buildDigestQuery — ORDER BY', () => {
  it('orders by relevance_score desc, then published_date desc', () => {
    const { sql } = buildDigestQuery({ since: SINCE })
    const order = orderClause(sql)
    const relIdx = order.search(/relevance_score/)
    const dateIdx = order.search(/published_date/)
    expect(relIdx).toBeGreaterThanOrEqual(0)
    expect(dateIdx).toBeGreaterThan(relIdx)
    expect(order).toMatch(/relevance_score[\s"]+desc/i)
  })
})

describe('buildDigestQuery — LIMIT', () => {
  it('caps the limit at DIGEST_MAX_PAPERS when oversized', () => {
    const { params, limit } = buildDigestQuery({ since: SINCE, limit: 9999 })
    expect(params).toContain(DIGEST_MAX_PAPERS)
    expect(limit).toBe(DIGEST_MAX_PAPERS)
    expect(DIGEST_MAX_PAPERS).toBe(20)
  })

  it('clamps the limit to a minimum of 1', () => {
    const { params, limit } = buildDigestQuery({ since: SINCE, limit: 0 })
    expect(params).toContain(1)
    expect(limit).toBe(1)
  })

  it('defaults to DIGEST_MAX_PAPERS when limit is unspecified', () => {
    const { params, limit } = buildDigestQuery({ since: SINCE })
    expect(params).toContain(DIGEST_MAX_PAPERS)
    expect(limit).toBe(DIGEST_MAX_PAPERS)
  })
})
