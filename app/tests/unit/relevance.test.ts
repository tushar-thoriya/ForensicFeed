// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { scoreRelevance, assignTags, TAG_ORDER } from '@/lib/ingestion/tagger'

const empty = { title: '', abstract: '' }

describe('scoreRelevance', () => {
  it('returns 0 for empty input', () => {
    expect(scoreRelevance(empty).score).toBe(0)
  })

  it('returns 0 when no keywords match', () => {
    expect(
      scoreRelevance({
        title: 'A paper about quantum cryptography',
        abstract: 'We propose a new lattice-based scheme.',
      }).score,
    ).toBe(0)
  })

  it('awards 0.4 for a single high-weight title hit', () => {
    const r = scoreRelevance({
      title: 'Forgery Detection on Scanned Invoices',
      abstract: 'Nothing else of interest here.',
    })
    expect(r.score).toBeCloseTo(0.4, 5)
  })

  it('awards 0.2 for a single high-weight abstract-only hit', () => {
    const r = scoreRelevance({
      title: 'A generic computer vision paper',
      abstract: 'We propose a new approach for tamper detection in images.',
    })
    expect(r.score).toBeCloseTo(0.2, 5)
  })

  it('counts a keyword present in both title and abstract only once (title weight)', () => {
    const r = scoreRelevance({
      title: 'Forgery Detection in Passport Photos',
      abstract: 'Our forgery detection pipeline uses deep features.',
    })
    // 'forgery detection' title = 0.4, abstract re-hit suppressed; 'passport' not a scoring keyword
    expect(r.score).toBeCloseTo(0.4, 5)
  })

  it('sums distinct keywords across title and abstract', () => {
    const r = scoreRelevance({
      title: 'Forgery Localization with Transformers',
      abstract: 'We also address copy-move detection and splicing detection.',
    })
    // title high: forgery localization = 0.4
    // abstract high: copy-move detection = 0.2, splicing detection = 0.2
    expect(r.score).toBeCloseTo(0.8, 5)
  })

  it('caps the score at 1.0', () => {
    const r = scoreRelevance({
      title:
        'Forgery Detection, Tamper Detection, Manipulation Detection, Forgery Localization, Splicing Detection',
      abstract:
        'copy-move detection, inpainting detection, document authentication, document verification, passport forgery, ID document',
    })
    expect(r.score).toBe(1)
  })

  it('mixes medium and low weights correctly', () => {
    const r = scoreRelevance({
      title: 'Deepfake Detection for Social Media',
      abstract: 'We explore digital forensics and image authenticity.',
    })
    // title medium: deepfake detection = 0.2
    // abstract low: digital forensics = 0.05, image authenticity = 0.05
    expect(r.score).toBeCloseTo(0.3, 5)
  })

  it('ignores low-weight keywords when they appear only in the title', () => {
    const r = scoreRelevance({
      title: 'Steganalysis revisited',
      abstract: 'A survey of modern techniques.',
    })
    // low-weight keywords contribute abstract-only (0.05); title-only => 0
    expect(r.score).toBe(0)
  })

  it('is case-insensitive', () => {
    const lower = scoreRelevance({
      title: 'forgery detection baseline',
      abstract: '',
    })
    const upper = scoreRelevance({
      title: 'FORGERY DETECTION BASELINE',
      abstract: '',
    })
    expect(upper.score).toBe(lower.score)
  })

  it('does not stem — "forgeries" must not trigger "forgery detection"', () => {
    const r = scoreRelevance({
      title: 'A survey of image forgeries in the wild',
      abstract: 'We review many forgeries.',
    })
    expect(r.score).toBe(0)
  })

  it('handles null abstract safely', () => {
    const r = scoreRelevance({ title: 'Forgery Detection Pipeline', abstract: null })
    expect(r.score).toBeCloseTo(0.4, 5)
  })

  it('is deterministic', () => {
    const input = {
      title: 'Copy-Move Detection',
      abstract: 'We use pixel-level segmentation for anomaly localization.',
    }
    const a = scoreRelevance(input)
    const b = scoreRelevance(input)
    expect(a.score).toBe(b.score)
  })
})

describe('assignTags', () => {
  it('returns an empty array when no tag keywords match', () => {
    expect(
      assignTags({ title: 'Generic CV paper', abstract: 'Nothing relevant.' }),
    ).toEqual([])
  })

  it('assigns copy-move, localization, and document tags on a passport forgery paper', () => {
    const tags = assignTags({
      title: 'Copy-Move Detection on Passport Photos',
      abstract: 'We perform pixel-level localization of forged regions in ID documents.',
    })
    expect(tags).toContain('copy-move')
    expect(tags).toContain('document')
    expect(tags).toContain('localization')
  })

  it('returns tags in canonical (TAG_ORDER) order', () => {
    const tags = assignTags({
      title: 'Deepfake and Copy-Move Detection',
      abstract: 'We also handle inpainting and document forgery.',
    })
    const indices = tags.map((t) => TAG_ORDER.indexOf(t))
    const sorted = [...indices].sort((a, b) => a - b)
    expect(indices).toEqual(sorted)
  })

  it('deduplicates: one tag even if multiple triggers fire', () => {
    const tags = assignTags({
      title: 'Splicing and splice detection with composite image analysis',
      abstract: 'Splicing artefacts are the focus.',
    })
    expect(tags.filter((t) => t === 'splicing')).toHaveLength(1)
  })

  it('is case-insensitive', () => {
    const a = assignTags({ title: 'DeepFake detection', abstract: '' })
    const b = assignTags({ title: 'deepfake detection', abstract: '' })
    expect(a).toEqual(b)
  })

  it('handles null abstract safely', () => {
    const tags = assignTags({ title: 'Diffusion model detection', abstract: null })
    expect(tags).toContain('diffusion')
  })

  it('triggers gan-detection on AI-generated mentions', () => {
    const tags = assignTags({
      title: 'Detecting AI-generated images',
      abstract: 'GAN detection methods.',
    })
    expect(tags).toContain('gan-detection')
  })

  it('triggers forensics on PRNU / noise analysis', () => {
    const tags = assignTags({
      title: 'PRNU-based image forensics',
      abstract: 'Noise analysis improves detection.',
    })
    expect(tags).toContain('forensics')
  })
})
