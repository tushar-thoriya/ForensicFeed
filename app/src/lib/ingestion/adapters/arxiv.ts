import * as cheerio from 'cheerio'
import type { Adapter, AdapterFetchOptions } from '@/lib/ingestion/types'
import type { NormalisedPaper } from '@/types/paper'
import { extractCodeUrl } from '@/lib/ingestion/code-url'

const ARXIV_ENDPOINT = 'https://export.arxiv.org/api/query'
const ARXIV_FETCH_TIMEOUT_MS = 30_000

const FORGERY_TERMS = [
  'forgery',
  'forensic',
  'forensics',
  'tamper',
  'tampering',
  'manipulation',
  'deepfake',
  'splicing',
  'copy-move',
  'copy move',
  'inpainting detection',
  // Deepfake-domain terms. 'forgery' and 'manipulation' above already match
  // "face forgery"/"face manipulation" at arXiv's word level, so only the
  // face-swap/reenactment phrasings need explicit terms here.
  'face swap',
  'faceswap',
  'face reenactment',
] as const

function buildSearchQuery(): string {
  const categoryClause = '(cat:cs.CV OR cat:cs.CR)'
  const keywordClause =
    '(' +
    FORGERY_TERMS.flatMap((term) => {
      const quoted = term.includes(' ') || term.includes('-') ? `%22${term}%22` : term
      return [`ti:${quoted}`, `abs:${quoted}`]
    }).join('+OR+') +
    ')'
  return `${categoryClause}+AND+${keywordClause}`
}

function buildUrl(maxResults: number, start: number): URL {
  // arXiv expects un-encoded Boolean operators (`+OR+`, `+AND+`) and pre-encoded
  // quoted multi-word terms (`%22copy-move%22`). URLSearchParams would percent-encode
  // these, so the query string is concatenated directly.
  const query = buildSearchQuery()
  return new URL(
    `${ARXIV_ENDPOINT}?search_query=${query}&sortBy=submittedDate&sortOrder=descending&start=${start}&max_results=${maxResults}`,
  )
}

function extractArxivId(idUrl: string): string | null {
  const match = idUrl.match(/arxiv\.org\/abs\/([^/?#]+)/)
  const captured = match?.[1]
  if (!captured) return null
  return captured.replace(/v\d+$/, '')
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function parseArxivAtom(xml: string): NormalisedPaper[] {
  const $ = cheerio.load(xml, { xmlMode: true })
  const papers: NormalisedPaper[] = []

  $('entry').each((_, el) => {
    const entry = $(el)
    const idUrl = entry.find('> id').first().text().trim()
    const arxivId = extractArxivId(idUrl)
    if (!arxivId) return

    const title = collapseWhitespace(entry.find('> title').first().text())
    if (!title) return

    const abstract = collapseWhitespace(entry.find('> summary').first().text()) || null
    const authors = entry
      .find('> author > name')
      .map((__, n) => collapseWhitespace($(n).text()))
      .get()
      .filter(Boolean)

    const publishedText = entry.find('> published').first().text().trim()
    const updatedText = entry.find('> updated').first().text().trim()
    const publishedDate = new Date(publishedText)
    if (Number.isNaN(publishedDate.getTime())) return
    const updatedDate = updatedText ? new Date(updatedText) : null

    const pdfLink = entry.find('> link[title="pdf"]').first().attr('href') ?? null
    const doi = entry.find('arxiv\\:doi').first().text().trim() || null

    papers.push({
      title,
      authors,
      abstract,
      arxivId,
      doi,
      venue: 'arXiv',
      venueType: 'arxiv',
      year: publishedDate.getUTCFullYear(),
      publishedDate,
      updatedDate,
      pdfUrl: pdfLink,
      codeUrl: extractCodeUrl(abstract) ?? extractCodeUrl(title),
      citationCount: null,
      primarySource: 'arxiv',
      rawMetadata: { arxivId, idUrl },
    })
  })

  return papers
}

export const arxivAdapter: Adapter = {
  source: 'arxiv',
  async fetch({ since, maxResults = 500 }: AdapterFetchOptions): Promise<NormalisedPaper[]> {
    const url = buildUrl(maxResults, 0)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ARXIV_FETCH_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/atom+xml' },
        signal: controller.signal,
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`arXiv API timed out after ${ARXIV_FETCH_TIMEOUT_MS}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`arXiv API returned ${response.status}: ${response.statusText}`)
    }

    const xml = await response.text()
    const papers = parseArxivAtom(xml)
    return papers.filter((p) => p.publishedDate >= since)
  },
}
