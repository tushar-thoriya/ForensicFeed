import type { Adapter, AdapterFetchOptions } from '@/lib/ingestion/types'
import type { NormalisedPaper } from '@/types/paper'
import { extractCodeUrl } from '@/lib/ingestion/code-url'

const HF_ENDPOINT = 'https://huggingface.co/api/papers/search'
const HF_FETCH_TIMEOUT_MS = 30_000

// Keyword groups that map well to HF search semantics. Smaller than arXiv's
// per-term search since HF returns ≤120 results per query and we don't want to
// waste rate limit on near-duplicates.
const QUERIES = [
  'image forgery detection',
  'image manipulation localization',
  'deepfake detection',
  'image splicing detection',
] as const

interface HFAuthor {
  name?: string
}

interface HFPaper {
  id?: string
  title?: string
  summary?: string
  authors?: HFAuthor[]
  publishedAt?: string
  upvotes?: number
  discussionId?: string | null
  ai_keywords?: string[]
}

interface HFSearchEntry {
  paper?: HFPaper
  publishedAt?: string
  title?: string
  summary?: string
  numComments?: number
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function pickPublishedDate(entry: HFSearchEntry): Date | null {
  const candidate = entry.paper?.publishedAt ?? entry.publishedAt
  if (!isNonEmptyString(candidate)) return null
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function parseHuggingFaceSearch(payload: unknown): NormalisedPaper[] {
  if (!Array.isArray(payload)) return []

  const out: NormalisedPaper[] = []
  for (const raw of payload as HFSearchEntry[]) {
    const paper = raw.paper
    if (!paper) continue
    const arxivId = isNonEmptyString(paper.id) ? paper.id : null
    if (!arxivId) continue

    const title =
      (isNonEmptyString(paper.title) ? paper.title : null) ??
      (isNonEmptyString(raw.title) ? raw.title : null)
    if (!title) continue

    const summary =
      (isNonEmptyString(paper.summary) ? paper.summary : null) ??
      (isNonEmptyString(raw.summary) ? raw.summary : null)

    const publishedDate = pickPublishedDate(raw)
    if (!publishedDate) continue

    const authors = (paper.authors ?? [])
      .map((a) => (isNonEmptyString(a.name) ? a.name : null))
      .filter((n): n is string => n !== null)

    const codeUrl = extractCodeUrl(summary) ?? extractCodeUrl(title)

    out.push({
      title,
      authors,
      abstract: summary,
      arxivId,
      doi: null,
      venue: 'arXiv',
      venueType: 'arxiv',
      year: publishedDate.getUTCFullYear(),
      publishedDate,
      updatedDate: null,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
      codeUrl,
      citationCount: null,
      primarySource: 'huggingface',
      rawMetadata: {
        upvotes: paper.upvotes ?? 0,
        numComments: raw.numComments ?? 0,
        aiKeywords: paper.ai_keywords ?? [],
        discussionId: paper.discussionId ?? null,
      },
    })
  }

  return out
}

async function fetchOnce(query: string): Promise<NormalisedPaper[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HF_FETCH_TIMEOUT_MS)

  try {
    const url = `${HF_ENDPOINT}?q=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Hugging Face API returned ${response.status}: ${response.statusText}`)
    }
    const json = (await response.json()) as unknown
    return parseHuggingFaceSearch(json)
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Hugging Face API timed out after ${HF_FETCH_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export const huggingfaceAdapter: Adapter = {
  source: 'huggingface',
  async fetch({ since }: AdapterFetchOptions): Promise<NormalisedPaper[]> {
    const seen = new Map<string, NormalisedPaper>()
    let lastError: Error | null = null

    for (const query of QUERIES) {
      let batch: NormalisedPaper[] = []
      try {
        batch = await fetchOnce(query)
      } catch (error) {
        // One keyword failing must not break the rest of the sweep. Track the
        // last failure so we can re-throw it if every query failed and we
        // ended with no results.
        lastError = error instanceof Error ? error : new Error('unknown HF error')
        continue
      }
      for (const paper of batch) {
        if (paper.publishedDate < since) continue
        const key = paper.arxivId ?? paper.title
        if (!seen.has(key)) seen.set(key, paper)
      }
    }

    if (seen.size === 0 && lastError) {
      throw new Error(`Hugging Face sweep failed: ${lastError.message}`)
    }
    return Array.from(seen.values())
  },
}
