import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { papers, type NewPaper, type Paper } from '@/lib/db/schema'
import type { NormalisedPaper } from '@/types/paper'
import { titleHash as computeTitleHash } from '@/lib/ingestion/dedup'
import { assignTags, scoreRelevance } from '@/lib/ingestion/tagger'

const MAX_FEED_LIMIT = 200

async function findExistingPaper(input: {
  arxivId: string | null
  doi: string | null
  titleHash: string
}): Promise<{ id: string } | null> {
  // Priority order: strongest identifier first. arxivId > doi > titleHash.
  // Each predicate is checked independently so a hash collision on a different
  // paper cannot bind to a row that already matched a stronger identifier.
  const lookups: SQL[] = []
  if (input.arxivId) lookups.push(eq(papers.arxivId, input.arxivId))
  if (input.doi) lookups.push(eq(papers.doi, input.doi))
  lookups.push(eq(papers.titleHash, input.titleHash))

  for (const condition of lookups) {
    const [row] = await db.select({ id: papers.id }).from(papers).where(condition).limit(1)
    if (row) return row
  }
  return null
}

function paperId(input: {
  arxivId: string | null
  doi: string | null
  titleHash: string
}): string {
  if (input.arxivId) return `arxiv:${input.arxivId}`
  if (input.doi) return `doi:${input.doi}`
  return `hash:${input.titleHash}`
}

export interface UpsertResult {
  inserted: boolean
  paperId: string
}

export async function upsertPaper(input: NormalisedPaper): Promise<UpsertResult> {
  const hash = computeTitleHash(input.title)
  const id = paperId({ arxivId: input.arxivId, doi: input.doi, titleHash: hash })

  const relevanceInput = { title: input.title, abstract: input.abstract }
  const { score: relevanceScore } = scoreRelevance(relevanceInput)
  const relevanceTags = assignTags(relevanceInput)

  const existing = await findExistingPaper({
    arxivId: input.arxivId,
    doi: input.doi,
    titleHash: hash,
  })

  if (existing) {
    // CLAUDE.md §4 dedup spec: enrich the row with newly-found values, never
    // overwrite published_date, never null out a previously-set field.
    // Build the SET object conditionally so absent fields stay untouched —
    // tsconfig has exactOptionalPropertyTypes: false, so `?? undefined` would
    // otherwise be persisted as SQL NULL.
    const setFields: Partial<NewPaper> = { relevanceScore, relevanceTags }
    if (input.updatedDate !== null) setFields.updatedDate = input.updatedDate
    if (input.codeUrl !== null) setFields.codeUrl = input.codeUrl
    if (input.citationCount !== null) setFields.citationCount = input.citationCount
    if (input.abstract !== null) setFields.abstract = input.abstract

    await db.update(papers).set(setFields).where(eq(papers.id, existing.id))
    return { inserted: false, paperId: existing.id }
  }

  await db.insert(papers).values({
    id,
    title: input.title,
    authors: input.authors,
    abstract: input.abstract,
    arxivId: input.arxivId,
    doi: input.doi,
    titleHash: hash,
    venue: input.venue,
    venueType: input.venueType,
    year: input.year,
    publishedDate: input.publishedDate,
    updatedDate: input.updatedDate,
    pdfUrl: input.pdfUrl,
    codeUrl: input.codeUrl,
    citationCount: input.citationCount,
    relevanceScore,
    relevanceTags,
    primarySource: input.primarySource,
    rawMetadata: input.rawMetadata,
  })
  return { inserted: true, paperId: id }
}

export interface ListOptions {
  limit?: number
  minRelevance?: number
  since?: Date
}

export async function listRecentPapers(options: ListOptions = {}): Promise<Paper[]> {
  const { limit = 50, minRelevance = 0, since } = options
  const clampedLimit = Math.min(Math.max(limit, 1), MAX_FEED_LIMIT)
  const conditions = [gte(papers.relevanceScore, minRelevance)]
  if (since) conditions.push(gte(papers.publishedDate, since))

  return db
    .select()
    .from(papers)
    .where(and(...conditions))
    .orderBy(desc(papers.publishedDate))
    .limit(clampedLimit)
}

export async function countPapers(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(papers)
  return row?.count ?? 0
}
