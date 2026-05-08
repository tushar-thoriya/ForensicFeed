// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { dedupKeyFor, normaliseTitle, titleHash } from '@/lib/ingestion/dedup'

describe('normaliseTitle', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normaliseTitle('  Copy-Move\tForgery  Localization\n  ')).toBe(
      'copymove forgery localization',
    )
  })

  it('strips punctuation and keeps unicode letters and digits', () => {
    expect(normaliseTitle('Forgery Detection: A 2026 Survey!')).toBe(
      'forgery detection a 2026 survey',
    )
    expect(normaliseTitle('Détection de Falsification')).toBe('détection de falsification')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normaliseTitle('   \t\n')).toBe('')
  })
})

describe('titleHash', () => {
  it('is deterministic across calls', () => {
    const a = titleHash('Forgery Detection in Document Images')
    const b = titleHash('Forgery Detection in Document Images')
    expect(a).toBe(b)
  })

  it('treats casing and punctuation differences as the same paper', () => {
    const a = titleHash('Forgery Detection: A Survey')
    const b = titleHash('forgery detection a survey')
    expect(a).toBe(b)
  })

  it('produces different hashes for different titles', () => {
    const a = titleHash('Splicing Detection')
    const b = titleHash('Copy-Move Detection')
    expect(a).not.toBe(b)
  })

  it('returns a 64-char sha256 hex string', () => {
    expect(titleHash('any title').length).toBe(64)
    expect(titleHash('any title')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('dedupKeyFor', () => {
  it('preserves arxivId and doi when present', () => {
    const key = dedupKeyFor({
      title: 'Splicing Detection',
      arxivId: '2604.01234',
      doi: '10.1109/X',
    })
    expect(key.arxivId).toBe('2604.01234')
    expect(key.doi).toBe('10.1109/X')
    expect(key.titleHash).toBe(titleHash('Splicing Detection'))
  })

  it('defaults missing identifiers to null', () => {
    const key = dedupKeyFor({ title: 'Splicing Detection' })
    expect(key.arxivId).toBeNull()
    expect(key.doi).toBeNull()
    expect(key.titleHash).toBe(titleHash('Splicing Detection'))
  })
})
