import { and, desc, gte, sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { papers, type Paper } from '@/lib/db/schema'

const dialect = new PgDialect()

// Defaults for the weekly digest. The threshold matches the feed's relevance
// floor (CLAUDE.md: relevance threshold 0.2) so the digest never surfaces a
// paper the feed itself would hide. The cap keeps the email short.
export const DIGEST_RELEVANCE_THRESHOLD = 0.2
export const DIGEST_WINDOW_DAYS = 7
export const DIGEST_MAX_PAPERS = 20

export interface BuildDigestQueryInput {
  // Lower bound on `created_at` (ingestion time). The caller computes this as
  // now − DIGEST_WINDOW_DAYS so the boundary stays testable against a fixed clock.
  since: Date
  threshold?: number
  limit?: number
}

export interface CompiledDigestQuery {
  sql: string
  params: unknown[]
  limit: number
}

// The digest email needs only content fields — no user state (saved/read) and
// no search highlight. `arxivId`/`pdfUrl` drive the "read on arXiv" link;
// `id` drives the in-app detail link built in the template phase.
export type DigestPaper = Pick<
  Paper,
  | 'id'
  | 'title'
  | 'authors'
  | 'venue'
  | 'venueType'
  | 'relevanceScore'
  | 'relevanceTags'
  | 'pdfUrl'
  | 'arxivId'
  | 'publishedDate'
  | 'createdAt'
>

export function clampDigestLimit(value: number | undefined): number {
  const n = value ?? DIGEST_MAX_PAPERS
  return Math.min(Math.max(n, 1), DIGEST_MAX_PAPERS)
}

export function buildDigestConditions(input: BuildDigestQueryInput): SQL[] {
  const threshold = input.threshold ?? DIGEST_RELEVANCE_THRESHOLD
  // Window keys off created_at (ingestion time), NOT published_date — a paper
  // published months ago but discovered this week must still appear.
  return [gte(papers.relevanceScore, threshold), gte(papers.createdAt, input.since)]
}

// Best + freshest first. published_date here is a tie-breaker in ORDER BY only;
// the time window itself filters on created_at (see buildDigestConditions).
export const DIGEST_ORDER_BY: SQL[] = [desc(papers.relevanceScore), desc(papers.publishedDate)]

// Pure builder — returns the compiled SQL/params so the query shape is unit-
// testable without a database. Mirrors buildListPapersQuery in list-papers-query.ts.
// The executor (fetchWeeklyDigestPapers) lives in papers.ts alongside the db
// client, mirroring how listRecentPapers consumes the list-papers builder.
export function buildDigestQuery(input: BuildDigestQueryInput): CompiledDigestQuery {
  const conditions = buildDigestConditions(input)
  const limit = clampDigestLimit(input.limit)

  const whereClause = and(...conditions) as SQL
  const orderClause = sql.join(DIGEST_ORDER_BY, sql`, `)
  const composed = sql`select * from ${papers} where ${whereClause} order by ${orderClause} limit ${limit}`
  const compiled = dialect.sqlToQuery(composed)

  return { sql: compiled.sql, params: compiled.params, limit }
}
