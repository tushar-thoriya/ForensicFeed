export type PaperSource =
  | 'arxiv'
  | 'paperswithcode'
  | 'semantic_scholar'
  | 'cvf'
  | 'openreview'
  | 'huggingface'

export type VenueType = 'arxiv' | 'conference' | 'journal' | 'workshop' | 'preprint'

export type ReadStatusValue = 'unread' | 'reading' | 'read' | 'archived'

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
