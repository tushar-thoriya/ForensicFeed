// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getSourceBadge } from '@/lib/ingestion/source-link'

describe('getSourceBadge', () => {
  it('returns null for sources other than greatzh', () => {
    expect(getSourceBadge('arxiv', {})).toBeNull()
    expect(getSourceBadge('cvf', { section: 'Image Splicing' })).toBeNull()
    expect(getSourceBadge('openreview', {})).toBeNull()
    expect(getSourceBadge('huggingface', {})).toBeNull()
    expect(getSourceBadge('semantic_scholar', {})).toBeNull()
    expect(getSourceBadge('paperswithcode', {})).toBeNull()
  })

  it('links to the repo root when rawMetadata has no section', () => {
    expect(getSourceBadge('greatzh', {})).toEqual({
      label: 'greatzh/papers',
      url: 'https://github.com/greatzh/papers',
    })
  })

  it('links to the repo root when section is not a string', () => {
    expect(getSourceBadge('greatzh', { section: 42 })).toEqual({
      label: 'greatzh/papers',
      url: 'https://github.com/greatzh/papers',
    })
  })

  it('deep-links to the heading anchor for a simple section name', () => {
    expect(getSourceBadge('greatzh', { section: 'AIGC' })).toEqual({
      label: 'greatzh/papers',
      url: 'https://github.com/greatzh/papers#aigc',
    })
  })

  it('converts spaces to hyphens and lowercases multi-word section names', () => {
    expect(getSourceBadge('greatzh', { section: 'Image Splicing' })).toEqual({
      label: 'greatzh/papers',
      url: 'https://github.com/greatzh/papers#image-splicing',
    })
    expect(getSourceBadge('greatzh', { section: 'Tamper Text in Detection' })).toEqual({
      label: 'greatzh/papers',
      url: 'https://github.com/greatzh/papers#tamper-text-in-detection',
    })
  })

  it('preserves existing hyphens in the section name', () => {
    expect(getSourceBadge('greatzh', { section: 'CNN-synthesized' })).toEqual({
      label: 'greatzh/papers',
      url: 'https://github.com/greatzh/papers#cnn-synthesized',
    })
  })
})
