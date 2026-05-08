// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractCodeUrl } from '@/lib/ingestion/code-url'

describe('extractCodeUrl', () => {
  it('returns null for empty input', () => {
    expect(extractCodeUrl(null)).toBeNull()
    expect(extractCodeUrl(undefined)).toBeNull()
    expect(extractCodeUrl('')).toBeNull()
  })

  it('extracts a plain GitHub repo URL', () => {
    expect(
      extractCodeUrl('Code is available at https://github.com/foo/bar.'),
    ).toBe('https://github.com/foo/bar')
  })

  it('handles trailing punctuation cleanly', () => {
    expect(
      extractCodeUrl('Repo: https://github.com/foo/bar, see paper for details.'),
    ).toBe('https://github.com/foo/bar')
    expect(
      extractCodeUrl('See https://github.com/foo/bar) for our implementation.'),
    ).toBe('https://github.com/foo/bar')
  })

  it('strips a trailing .git suffix', () => {
    expect(extractCodeUrl('Clone https://github.com/foo/bar.git for code')).toBe(
      'https://github.com/foo/bar',
    )
  })

  it('preserves repo names with dots and hyphens', () => {
    expect(extractCodeUrl('https://github.com/lab-org/forgery-detect.v2')).toBe(
      'https://github.com/lab-org/forgery-detect.v2',
    )
  })

  it('ignores GitHub navigation pages (not actual repos)', () => {
    expect(extractCodeUrl('See https://github.com/topics/forgery')).toBeNull()
    expect(extractCodeUrl('Search at https://github.com/search?q=forgery')).toBeNull()
    expect(extractCodeUrl('Visit https://github.com/orgs/somelab')).toBeNull()
  })

  it('returns the first match when multiple repos appear', () => {
    expect(
      extractCodeUrl(
        'Two repos: https://github.com/foo/first and https://github.com/bar/second.',
      ),
    ).toBe('https://github.com/foo/first')
  })

  it('returns null when no GitHub URL is present', () => {
    expect(extractCodeUrl('No code is provided in this paper.')).toBeNull()
    expect(
      extractCodeUrl('Visit https://example.com/foo/bar for the dataset'),
    ).toBeNull()
  })

  it('accepts http and trims www', () => {
    expect(extractCodeUrl('Mirror at http://www.github.com/foo/bar')).toBe(
      'https://github.com/foo/bar',
    )
  })
})
