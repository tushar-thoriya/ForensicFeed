import type { NormalisedPaper, PaperSource } from '@/types/paper'

export interface AdapterFetchOptions {
  since: Date
  now: Date
  apiKey?: string | null
  maxResults?: number
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
