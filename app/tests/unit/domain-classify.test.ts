import { describe, expect, it } from 'vitest'
import { classifyDomain } from '@/lib/ingestion/domain'

describe('classifyDomain', () => {
  it('classifies a pure deepfake paper as deepfake', () => {
    expect(
      classifyDomain({
        title: 'Deepfake Detection via Frequency Domain Analysis',
        abstract: 'We propose a method for detecting face swap videos.',
      }),
    ).toBe('deepfake')
  })

  it('classifies a pure forgery paper as forgery', () => {
    expect(
      classifyDomain({
        title: 'Robust Image Splicing Localization',
        abstract: 'A method for tamper localization in document images.',
      }),
    ).toBe('forgery')
  })

  it('defaults to forgery when no signal matches either list', () => {
    expect(
      classifyDomain({
        title: 'A Novel Transformer Architecture for Image Classification',
        abstract: 'We study attention mechanisms.',
      }),
    ).toBe('forgery')
  })

  it('resolves a title mentioning both face and forgery-core terms to forgery (tie goes to forgery)', () => {
    expect(
      classifyDomain({
        title: 'Face Forgery Localization via Splicing Artifact Analysis',
        abstract: null,
      }),
    ).toBe('forgery')
  })

  it('overrides a deepfake hint when a forgery-core keyword is present', () => {
    expect(
      classifyDomain(
        {
          title: 'Face Forgery Localization in Document Photos',
          abstract: null,
        },
        'deepfake',
      ),
    ).toBe('forgery')
  })

  it('respects a forgery hint outright, even with deepfake keywords in the text', () => {
    expect(
      classifyDomain(
        {
          title: 'Deepfake Face Swap Survey',
          abstract: null,
        },
        'forgery',
      ),
    ).toBe('forgery')
  })

  it('respects a deepfake hint when no forgery-core keyword overrides it', () => {
    expect(
      classifyDomain(
        {
          title: 'A New Benchmark for Face Video Analysis',
          abstract: null,
        },
        'deepfake',
      ),
    ).toBe('deepfake')
  })

  it('handles a null abstract without throwing', () => {
    expect(() => classifyDomain({ title: 'Deepfake Detection', abstract: null })).not.toThrow()
  })

  it('is case-insensitive', () => {
    expect(
      classifyDomain({
        title: 'DEEPFAKE Detection Using FACE SWAP Artifacts',
        abstract: null,
      }),
    ).toBe('deepfake')
  })
})
