export interface RelevanceInput {
  title: string
  abstract: string | null
}

export interface RelevanceResult {
  score: number
  tags: Tag[]
}

export const SCORE_CAP = 1.0
export const SCORE_FLOOR_THRESHOLD = 0.2

const HIGH_KEYWORDS = [
  'forgery detection',
  'tamper detection',
  'manipulation detection',
  'image forensics',
  'forgery localization',
  'splicing detection',
  'copy-move detection',
  'inpainting detection',
  'document authentication',
  'document verification',
  'id document',
  'passport forgery',
] as const

const MEDIUM_KEYWORDS = [
  'image integrity',
  'deepfake detection',
  'face swap detection',
  'gan detection',
  'ai-generated image',
  'pixel-level segmentation',
  'anomaly localization',
  'passive authentication',
  'prnu',
  'noise analysis',
  'watermark detection',
] as const

const LOW_KEYWORDS = [
  'image authenticity',
  'digital forensics',
  'image manipulation',
  'steganalysis',
] as const

const HIGH_TITLE = 0.4
const HIGH_ABSTRACT = 0.2
const MED_TITLE = 0.2
const MED_ABSTRACT = 0.1
const LOW_ABSTRACT = 0.05

export const TAG_ORDER = [
  'copy-move',
  'splicing',
  'inpainting',
  'localization',
  'document',
  'text-manipulation',
  'deepfake',
  'gan-detection',
  'passive-auth',
  'forensics',
  'transformer',
  'diffusion',
] as const

export type Tag = (typeof TAG_ORDER)[number]

const TAG_TRIGGERS: Record<Tag, readonly string[]> = {
  'copy-move': ['copy-move', 'copy move', 'duplication detection'],
  splicing: ['splicing', 'splice', 'composite image'],
  inpainting: ['inpainting', 'removal detection', 'object removal'],
  localization: ['localization', 'segmentation mask', 'pixel-level', 'region-level'],
  document: ['document', 'passport', 'id card', 'driving license', 'national id', 'ovd'],
  'text-manipulation': ['text region', 'ocr tampering', 'text forgery', 'altered text'],
  deepfake: ['deepfake', 'face swap', 'face manipulation', 'face forgery'],
  'gan-detection': ['gan detection', 'ai-generated', 'synthetic image', 'generative'],
  'passive-auth': ['passive authentication', 'no watermark', 'blind detection'],
  forensics: ['image forensics', 'digital forensics', 'prnu', 'noise analysis'],
  transformer: ['transformer', 'vit', 'attention-based'],
  diffusion: ['diffusion model', 'ddpm'],
}

function weightForKeyword(
  keyword: string,
  title: string,
  abstract: string,
  titleWeight: number,
  abstractWeight: number,
): number {
  if (titleWeight > 0 && title.includes(keyword)) return titleWeight
  if (abstractWeight > 0 && abstract.includes(keyword)) return abstractWeight
  return 0
}

export function scoreRelevance(input: RelevanceInput): RelevanceResult {
  const title = input.title.toLowerCase()
  const abstract = (input.abstract ?? '').toLowerCase()

  let score = 0

  for (const kw of HIGH_KEYWORDS) {
    score += weightForKeyword(kw, title, abstract, HIGH_TITLE, HIGH_ABSTRACT)
  }
  for (const kw of MEDIUM_KEYWORDS) {
    score += weightForKeyword(kw, title, abstract, MED_TITLE, MED_ABSTRACT)
  }
  for (const kw of LOW_KEYWORDS) {
    score += weightForKeyword(kw, title, abstract, 0, LOW_ABSTRACT)
  }

  const capped = Math.min(score, SCORE_CAP)
  const tags = assignTagsInternal(title, abstract)
  return { score: capped, tags }
}

export function assignTags(input: RelevanceInput): Tag[] {
  const title = input.title.toLowerCase()
  const abstract = (input.abstract ?? '').toLowerCase()
  return assignTagsInternal(title, abstract)
}

function assignTagsInternal(titleLower: string, abstractLower: string): Tag[] {
  const haystack = `${titleLower} ${abstractLower}`
  const hits: Tag[] = []
  for (const tag of TAG_ORDER) {
    const triggers = TAG_TRIGGERS[tag]
    if (triggers.some((t) => haystack.includes(t))) {
      hits.push(tag)
    }
  }
  return hits
}
