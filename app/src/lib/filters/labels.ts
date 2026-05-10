import type { Tag } from '@/lib/ingestion/tagger'
import type { PaperSource, VenueType } from '@/types/paper'

export const SOURCE_LABEL: Record<PaperSource, string> = {
  arxiv: 'arXiv',
  paperswithcode: 'PapersWithCode',
  semantic_scholar: 'Semantic Scholar',
  cvf: 'CVF',
  openreview: 'OpenReview',
  huggingface: 'HF Papers',
}

export const VENUE_TYPE_LABEL: Record<VenueType, string> = {
  arxiv: 'arXiv',
  conference: 'Conference',
  journal: 'Journal',
  workshop: 'Workshop',
  preprint: 'Preprint',
}

export const TAG_LABEL: Record<Tag, string> = {
  'copy-move': 'Copy-move',
  splicing: 'Splicing',
  inpainting: 'Inpainting',
  localization: 'Localization',
  document: 'Document',
  'text-manipulation': 'Text manipulation',
  deepfake: 'Deepfake',
  'gan-detection': 'GAN detection',
  'passive-auth': 'Passive auth',
  forensics: 'Forensics',
  transformer: 'Transformer',
  diffusion: 'Diffusion',
}

export const SOURCE_VALUES: ReadonlyArray<PaperSource> = [
  'arxiv',
  'paperswithcode',
  'semantic_scholar',
  'cvf',
  'openreview',
  'huggingface',
]

export const VENUE_TYPE_VALUES: ReadonlyArray<VenueType> = [
  'arxiv',
  'conference',
  'journal',
  'workshop',
  'preprint',
]
