import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { papers, readStatus, userSaves } from '@/lib/db/schema'
import type { PaperWithUserState } from '@/types/paper'
import { EMPTY_FILTERS, type FilterState } from '@/types/filter'
import {
  buildConditions,
  buildOrderBy,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
} from '@/lib/db/queries/list-papers-query'

export interface ListSavedOptions {
  filters?: FilterState
  limit?: number
  minRelevance?: number
}

// Same projection as listRecentPapers but INNER JOIN on user_saves so only
// saved papers come back, and the default order flips to saved_at DESC
// (most-recently-saved first) when the user has not picked an explicit
// sort. Explicit `sortBy === 'newest' | 'relevance'` still wins.
export async function listSavedPapers(
  options: ListSavedOptions = {},
): Promise<PaperWithUserState[]> {
  const { filters = EMPTY_FILTERS, limit = DEFAULT_FEED_LIMIT, minRelevance = 0 } = options
  const clampedLimit = Math.min(Math.max(limit, 1), MAX_FEED_LIMIT)

  const conditions = buildConditions({ filters, minRelevance })

  // Headline only when searching — same rule as listRecentPapers. Repeating
  // the literal here (rather than importing it) keeps each query file
  // standalone; the duplication is small and the sentinel bytes (\x02 /
  // \x03) must stay in sync with render-highlight.tsx in either case.
  const headlineExpr =
    filters.searchQuery !== null
      ? sql<string | null>`ts_headline('english', coalesce(${papers.title}, '') || ' ' || coalesce(${papers.abstract}, ''), websearch_to_tsquery('english', ${filters.searchQuery}), 'StartSel=\x02,StopSel=\x03,MaxWords=35,MinWords=15,MaxFragments=1')`
      : sql<string | null>`null::text`

  // Default ORDER BY for the saved view is by save-recency. buildOrderBy
  // returns published_date DESC for sortBy=null, which is wrong here —
  // override with saved_at DESC unless the user picked an explicit sort.
  const orderBy =
    filters.sortBy === null && filters.searchQuery === null
      ? [desc(userSaves.savedAt)]
      : buildOrderBy(filters)

  const rows = await db
    .select({
      id: papers.id,
      title: papers.title,
      authors: papers.authors,
      abstract: papers.abstract,
      arxivId: papers.arxivId,
      doi: papers.doi,
      titleHash: papers.titleHash,
      venue: papers.venue,
      venueType: papers.venueType,
      year: papers.year,
      publishedDate: papers.publishedDate,
      updatedDate: papers.updatedDate,
      pdfUrl: papers.pdfUrl,
      codeUrl: papers.codeUrl,
      citationCount: papers.citationCount,
      relevanceScore: papers.relevanceScore,
      relevanceTags: papers.relevanceTags,
      primarySource: papers.primarySource,
      rawMetadata: papers.rawMetadata,
      createdAt: papers.createdAt,
      headline: headlineExpr,
      // INNER JOIN guarantees user_saves row exists, so this is always true.
      // Still project it so the row shape matches PaperWithUserState
      // without a post-query map.
      isSaved: sql<boolean>`true`,
      isRead: sql<boolean>`(${readStatus.status} = 'read')`,
    })
    .from(papers)
    .innerJoin(userSaves, eq(userSaves.paperId, papers.id))
    .leftJoin(readStatus, eq(readStatus.paperId, papers.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(clampedLimit)

  return rows
}

export async function countSavedPapers(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSaves)
  return row?.count ?? 0
}
