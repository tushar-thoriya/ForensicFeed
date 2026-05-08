import { describe, expect, it } from 'vitest'
import { sanitiseExternalUrl } from '@/lib/security/url'

describe('sanitiseExternalUrl', () => {
  it('returns null for null and undefined', () => {
    expect(sanitiseExternalUrl(null)).toBeNull()
    expect(sanitiseExternalUrl(undefined)).toBeNull()
    expect(sanitiseExternalUrl('')).toBeNull()
  })

  it('passes https URLs through', () => {
    expect(sanitiseExternalUrl('https://arxiv.org/pdf/2604.12345v1.pdf')).toBe(
      'https://arxiv.org/pdf/2604.12345v1.pdf',
    )
  })

  it('passes http URLs through', () => {
    expect(sanitiseExternalUrl('http://example.com/paper.pdf')).toBe(
      'http://example.com/paper.pdf',
    )
  })

  it('rejects javascript: scheme', () => {
    expect(sanitiseExternalUrl('javascript:alert(1)')).toBeNull()
    expect(sanitiseExternalUrl('JAVASCRIPT:alert(1)')).toBeNull()
  })

  it('rejects data: scheme', () => {
    expect(sanitiseExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejects file: scheme', () => {
    expect(sanitiseExternalUrl('file:///etc/passwd')).toBeNull()
  })

  it('rejects malformed URLs', () => {
    expect(sanitiseExternalUrl('not a url at all')).toBeNull()
    expect(sanitiseExternalUrl('://broken')).toBeNull()
  })
})
