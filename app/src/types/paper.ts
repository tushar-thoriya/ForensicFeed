export type PaperSource =
  | 'arxiv'
  | 'semantic_scholar'
  | 'cvf'
  | 'openreview'
  | 'huggingface'
  | 'greatzh'

// 'forgery' is the user's default research focus (document/image forgery
// detection & localization); 'deepfake' covers face-swap/face-forgery/
// synthetic-face detection. Every paper belongs to exactly one domain — see
// classifyDomain in lib/ingestion/domain.ts for how it's assigned.
export type PaperDomain = 'forgery' | 'deepfake'

export type VenueType = 'arxiv' | 'conference' | 'journal' | 'workshop' | 'preprint'

export type ReadStatusValue = 'unread' | 'reading' | 'read' | 'archived'

// Re-exported here so consumers don't have to import from schema.ts.
// `headline` is populated by ts_headline ONLY when listRecentPapers receives
// a non-null searchQuery; it carries START/END sentinel characters that
// renderHighlight wraps in <mark> elements.
import type { Paper } from '@/lib/db/schema'
export type PaperWithHighlight = Paper & { headline: string | null }

// listRecentPapers / listSavedPapers always project per-paper user state via
// LEFT JOIN on user_saves and read_status. Both flags are non-optional —
// absent rows project to false, so consumers can read them directly without
// null checks. `isRead` is true ONLY when read_status.status === 'read';
// the schema's other enum values (`reading`, `archived`) count as not-read
// in A6 (binary read UI; see A6-PRD.md).
export type PaperWithUserState = PaperWithHighlight & {
  isSaved: boolean
  isRead: boolean
}

export interface NormalisedPaper {
  title: string
  authors: string[]
  abstract: string | null

  arxivId: string | null
  doi: string | null

  venue: string | null
  venueType: VenueType
  year: number | null

  publishedDate: Date
  updatedDate: Date | null

  pdfUrl: string | null
  codeUrl: string | null
  citationCount: number | null

  primarySource: PaperSource
  rawMetadata: Record<string, unknown>

  // Curator-provided domain signal (currently only greatzh, derived from its
  // section heading). classifyDomain treats this as a strong prior but a
  // forgery-core keyword hit in title/abstract still overrides it — see
  // lib/ingestion/domain.ts.
  domainHint?: PaperDomain
}
