import type { NormalisedPaper, PaperSource } from '@/types/paper'

export interface AdapterFetchOptions {
  since: Date
  now: Date
  apiKey?: string | null
  maxResults?: number
  // Per-source venue/group selectors. CVF uses codes like 'CVPR2024';
  // OpenReview uses group paths like 'ICLR.cc/2025/Conference'. Adapters
  // that don't recognise the field ignore it.
  venues?: string[]
  // Delay between successive upstream requests, ms. Adapters that page or
  // sweep multiple queries honour this to stay under source rate limits;
  // primarily an override hook for tests. Adapters that don't page ignore it.
  throttleMs?: number
  // Keyword queries for search-driven adapters (Semantic Scholar). Adapters
  // with a fixed source listing ignore it.
  queries?: string[]
}

export interface Adapter {
  source: PaperSource
  fetch(options: AdapterFetchOptions): Promise<NormalisedPaper[]>
}

export interface RunResult {
  source: PaperSource
  startedAt: Date
  finishedAt: Date
  durationMs: number
  papersFetched: number
  papersInserted: number
  papersUpdated: number
  status: 'success' | 'partial' | 'failed'
  errorMessage: string | null
}
