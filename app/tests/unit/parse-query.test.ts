// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_SEARCH_QUERY_LENGTH, parseSearchQuery } from '@/lib/search/parse-query'

describe('parseSearchQuery', () => {
  it('returns null for null', () => {
    expect(parseSearchQuery(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parseSearchQuery(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseSearchQuery('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(parseSearchQuery('   ')).toBeNull()
  })

  it('returns null for tabs and newlines', () => {
    expect(parseSearchQuery('\t\n\r')).toBeNull()
  })

  it('preserves a simple lowercase word', () => {
    expect(parseSearchQuery('copy-move')).toBe('copy-move')
  })

  it('trims leading and trailing whitespace', () => {
    expect(parseSearchQuery('  forgery  ')).toBe('forgery')
  })

  it('collapses internal whitespace to single spaces', () => {
    expect(parseSearchQuery('  copy   move  detection  ')).toBe('copy move detection')
  })

  it('treats mixed whitespace (tabs, newlines, spaces) as one space', () => {
    expect(parseSearchQuery('copy\t\tmove\n\ndetection')).toBe('copy move detection')
  })

  it('truncates to MAX_SEARCH_QUERY_LENGTH characters', () => {
    const huge = 'a'.repeat(500)
    const result = parseSearchQuery(huge)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(MAX_SEARCH_QUERY_LENGTH)
  })

  it('truncates AFTER trimming so leading whitespace does not eat budget', () => {
    const huge = '   ' + 'a'.repeat(500)
    const result = parseSearchQuery(huge)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(MAX_SEARCH_QUERY_LENGTH)
    expect(result![0]).toBe('a')
  })

  it('does not escape SQL syntax — bind param handles safety', () => {
    const sqlish = "'); DROP TABLE papers;--"
    expect(parseSearchQuery(sqlish)).toBe(sqlish)
  })

  it('preserves non-ASCII unicode', () => {
    expect(parseSearchQuery('déjà vu')).toBe('déjà vu')
  })

  it('preserves websearch_to_tsquery operators (-, OR, quotes)', () => {
    expect(parseSearchQuery('forgery -deepfake')).toBe('forgery -deepfake')
    expect(parseSearchQuery('"copy move" detection')).toBe('"copy move" detection')
    expect(parseSearchQuery('forgery or tamper')).toBe('forgery or tamper')
  })

  it('returns null after collapsing pure-whitespace input', () => {
    expect(parseSearchQuery('  '.repeat(100))).toBeNull()
  })

  it('MAX_SEARCH_QUERY_LENGTH is reasonable', () => {
    // Defensive: if someone bumps this to a megabyte, the integration test
    // costs go up. Keep it bounded.
    expect(MAX_SEARCH_QUERY_LENGTH).toBeLessThanOrEqual(500)
    expect(MAX_SEARCH_QUERY_LENGTH).toBeGreaterThanOrEqual(100)
  })
})
