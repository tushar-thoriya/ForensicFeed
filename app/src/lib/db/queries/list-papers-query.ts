import { and, desc, gte, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
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

export function buildConditions(input: BuildListPapersInput): SQL[] {
  const { filters, minRelevance, since } = input
  const conditions: SQL[] = [gte(papers.relevanceScore, minRelevance)]

  if (since) conditions.push(gte(papers.publishedDate, since))
  if (filters.sources.length > 0) conditions.push(inArray(papers.primarySource, filters.sources))
  if (filters.venueTypes.length > 0) conditions.push(inArray(papers.venueType, filters.venueTypes))
  if (filters.years.length > 0) conditions.push(inArray(papers.year, filters.years))
  if (filters.tags.length > 0) conditions.push(tagOverlapCondition(filters.tags))
  if (filters.hasCode === true) conditions.push(isNotNull(papers.codeUrl))
  else if (filters.hasCode === false) conditions.push(isNull(papers.codeUrl))

  return conditions
}

export function buildOrderBy(filters: FilterState): SQL[] {
  if (filters.sortBy === 'relevance') {
    return [desc(papers.relevanceScore), desc(papers.publishedDate)]
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
