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
    expect(sanitiseExternalUrl('http://example.com/paper.pdf')).toBe('http://example.com/paper.pdf')
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

  it('rejects localhost and 127.0.0.0/8', () => {
    expect(sanitiseExternalUrl('http://localhost/foo')).toBeNull()
    expect(sanitiseExternalUrl('http://127.0.0.1/admin')).toBeNull()
    expect(sanitiseExternalUrl('http://127.42.42.42/')).toBeNull()
  })

  it('rejects RFC1918 private ranges', () => {
    expect(sanitiseExternalUrl('http://10.0.0.1/')).toBeNull()
    expect(sanitiseExternalUrl('http://192.168.1.1/')).toBeNull()
    expect(sanitiseExternalUrl('http://172.16.0.1/')).toBeNull()
    expect(sanitiseExternalUrl('http://172.31.255.255/')).toBeNull()
    // 172.32.x is outside the private range and should pass.
    expect(sanitiseExternalUrl('http://172.32.0.1/')).toBe('http://172.32.0.1/')
  })

  it('rejects link-local IMDS endpoint', () => {
    expect(sanitiseExternalUrl('http://169.254.169.254/latest/meta-data/')).toBeNull()
  })

  it('rejects IPv6 loopback and link-local', () => {
    expect(sanitiseExternalUrl('http://[::1]/foo')).toBeNull()
    expect(sanitiseExternalUrl('http://[fe80::1]/foo')).toBeNull()
    expect(sanitiseExternalUrl('http://[fc00::1]/foo')).toBeNull()
  })
})
