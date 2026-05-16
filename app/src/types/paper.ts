export type PaperSource =
  | 'arxiv'
  | 'paperswithcode'
  | 'semantic_scholar'
  | 'cvf'
  | 'openreview'
  | 'huggingface'

export type VenueType = 'arxiv' | 'conference' | 'journal' | 'workshop' | 'preprint'

export type ReadStatusValue = 'unread' | 'reading' | 'read' | 'archived'

// Re-exported here so consumers don't have to import from schema.ts.
// `headline` is populated by ts_headline ONLY when listRecentPapers receives
// a non-null searchQuery; it carries START/END sentinel characters that
// renderHighlight wraps in <mark> elements.
import type { Paper } from '@/lib/db/schema'
export type PaperWithHighlight = Paper & { headline: string | null }

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
}
