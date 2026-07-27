import { and, desc, eq, gte, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { papers } from '@/lib/db/schema'
import type { FilterState } from '@/types/filter'

const dialect = new PgDialect()

export const MAX_FEED_LIMIT = 200
export const DEFAULT_FEED_LIMIT = 50

export interface BuildListPapersInput {
  filters: FilterState
  minRelevance: number
  since?: Date
  limit?: number
  // When true, the feed-tab domain constraint is skipped entirely — used by
  // the saved view, which is a personal cross-domain library that shows saves
  // from both tabs regardless of the (irrelevant there) domain in filters.
  ignoreDomain?: boolean
}

export interface CompiledQuery {
  sql: string
  params: unknown[]
  conditions: SQL[]
  orderBy: SQL[]
  limit: number
}

function clampLimit(value: number | undefined): number {
  const n = value ?? DEFAULT_FEED_LIMIT
  return Math.min(Math.max(n, 1), MAX_FEED_LIMIT)
}

function tagOverlapCondition(tags: readonly string[]): SQL {
  // relevance_tags is jsonb (schema:69), not text[]. Postgres `?|` operator
  // returns true when ANY of the right-hand strings exists as an element in
  // the jsonb array. drizzle's arrayOverlaps emits `&&` which is text[]-only
  // and would crash at runtime here.
  const literals = tags.map((t) => sql`${t}`)
  return sql`${papers.relevanceTags} ?| ARRAY[${sql.join(literals, sql`, `)}]`
}

// `search_vector` is a generated tsvector column maintained by Postgres but
// intentionally not declared in schema.ts — see A5-PRD.md scope §1. All
// references go through raw sql fragments here (same pattern as the jsonb
// `?|` operator above).
function searchMatchCondition(query: string): SQL {
  return sql`search_vector @@ websearch_to_tsquery('english', ${query})`
}

function tsRankExpr(query: string): SQL {
  return sql`ts_rank_cd(search_vector, websearch_to_tsquery('english', ${query}))`
}

// The feed card clamps .paper-card-abstract to 3 lines (-webkit-line-clamp,
// feed.css) — roughly 300 chars at --content-max: 860px. Abstracts average
// ~1500 chars, so the full column sent ~80% of its bytes straight into
// overflow:hidden, and twice over: SSR HTML plus the RSC flight copy React
// needs to hydrate. Trimming in Postgres keeps both copies small. The detail
// page (getPaperById) still selects the full column.
export const FEED_ABSTRACT_SNIPPET_CHARS = 400

export function abstractSnippetExpr(
  maxChars: number = FEED_ABSTRACT_SNIPPET_CHARS,
): SQL<string | null> {
  // The `\\s` / `\\S` escapes are load-bearing: `\s` inside a JS template
  // literal collapses to a bare `s`, which would match the letter rather than
  // whitespace and cut the snippet mid-word. regexp_replace drops the trailing
  // partial word left by `left()`; the ellipsis marks the cut, since CSS only
  // adds one of its own when the text still overflows three lines.
  return sql<string | null>`case
    when ${papers.abstract} is null then null
    when length(${papers.abstract}) <= ${maxChars} then ${papers.abstract}
    else regexp_replace(left(${papers.abstract}, ${maxChars}), '\\s+\\S*$', '') || '…'
  end`
}

export function buildConditions(input: BuildListPapersInput): SQL[] {
  const { filters, minRelevance, since, ignoreDomain } = input
  const conditions: SQL[] = [gte(papers.relevanceScore, minRelevance)]

  if (!ignoreDomain) conditions.push(eq(papers.domain, filters.domain))
  if (since) conditions.push(gte(papers.publishedDate, since))
  if (filters.sources.length > 0) conditions.push(inArray(papers.primarySource, filters.sources))
  if (filters.venueTypes.length > 0) conditions.push(inArray(papers.venueType, filters.venueTypes))
  if (filters.years.length > 0) conditions.push(inArray(papers.year, filters.years))
  if (filters.tags.length > 0) conditions.push(tagOverlapCondition(filters.tags))
  if (filters.hasCode === true) conditions.push(isNotNull(papers.codeUrl))
  else if (filters.hasCode === false) conditions.push(isNull(papers.codeUrl))
  if (filters.searchQuery !== null) conditions.push(searchMatchCondition(filters.searchQuery))

  return conditions
}

// ORDER BY precedence:
//   sortBy === 'relevance' → relevance_score desc, published_date desc (user override wins)
//   sortBy === 'newest'    → published_date desc (user override wins)
//   sortBy === null        → if searching: ts_rank_cd desc, published_date desc
//                          → else:        published_date desc (the historical default)
export function buildOrderBy(filters: FilterState): SQL[] {
  if (filters.sortBy === 'relevance') {
    return [desc(papers.relevanceScore), desc(papers.publishedDate)]
  }
  if (filters.sortBy === 'newest') {
    return [desc(papers.publishedDate)]
  }
  // sortBy === null
  if (filters.searchQuery !== null) {
    return [sql`${tsRankExpr(filters.searchQuery)} DESC`, desc(papers.publishedDate)]
  }
  return [desc(papers.publishedDate)]
}

export function buildListPapersQuery(input: BuildListPapersInput): CompiledQuery {
  const conditions = buildConditions(input)
  const orderBy = buildOrderBy(input.filters)
  const limit = clampLimit(input.limit)

  // Compose a representative SQL/params payload for testing. We render the
  // WHERE clause via `and(...)`, the ORDER BY via desc(), and bind the limit
  // explicitly so unit tests can assert on the final shape without touching
  // the DB client.
  const whereClause = and(...conditions) as SQL
  const orderClause = sql.join(orderBy, sql`, `)
  const composed = sql`select * from ${papers} where ${whereClause} order by ${orderClause} limit ${limit}`
  const compiled = dialect.sqlToQuery(composed)

  return {
    sql: compiled.sql,
    params: compiled.params,
    conditions,
    orderBy,
    limit,
  }
}
