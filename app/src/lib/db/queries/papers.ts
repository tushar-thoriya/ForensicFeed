import { and, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { papers, readStatus, userSaves, type NewPaper } from '@/lib/db/schema'
import type {
  NormalisedPaper,
  PaperDomain,
  PaperSource,
  PaperWithUserState,
  VenueType,
} from '@/types/paper'
import { titleHash as computeTitleHash } from '@/lib/ingestion/dedup'
import { assignTags, scoreRelevance } from '@/lib/ingestion/tagger'
import { classifyDomain } from '@/lib/ingestion/domain'
import { EMPTY_FILTERS, type FilterState } from '@/types/filter'
import { SOURCE_VALUES, VENUE_TYPE_VALUES } from '@/lib/filters/labels'
import {
  buildConditions,
  buildOrderBy,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
} from '@/lib/db/queries/list-papers-query'
import {
  buildDigestConditions,
  clampDigestLimit,
  DIGEST_ORDER_BY,
  type BuildDigestQueryInput,
  type DigestPaper,
} from '@/lib/db/queries/digest-query'

const SOURCE_SET = new Set<string>(SOURCE_VALUES)
const VENUE_TYPE_SET = new Set<string>(VENUE_TYPE_VALUES)

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

function paperId(input: { arxivId: string | null; doi: string | null; titleHash: string }): string {
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
  const domain = classifyDomain(relevanceInput, input.domainHint)

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
    // `domain` refreshes on every update just like relevanceScore/tags: it's
    // recomputed from the incoming adapter's title/abstract (+ its domainHint),
    // so a greatzh re-ingest whose section says 'deepfake' wins on a
    // cross-source dedup collision — the curator's placement is authoritative,
    // still subject to classifyDomain's forgery-core overrides.
    const setFields: Partial<NewPaper> = { relevanceScore, relevanceTags, domain }
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
    domain,
  })
  return { inserted: true, paperId: id }
}

export interface ListOptions {
  filters?: FilterState
  limit?: number
  minRelevance?: number
  since?: Date
}

// Return shape is always PaperWithUserState[] so consumers do not branch on
// whether a search was performed or whether per-paper state exists; `headline`
// is the ts_headline snippet when searching (carries START/END sentinels for
// renderHighlight) and `null` otherwise. `isSaved` / `isRead` come from LEFT
// JOINs on user_saves / read_status — absent rows project to false so
// consumers can read them as plain booleans (see PaperWithUserState).
export async function listRecentPapers(options: ListOptions = {}): Promise<PaperWithUserState[]> {
  const { filters = EMPTY_FILTERS, limit = DEFAULT_FEED_LIMIT, minRelevance = 0, since } = options
  const clampedLimit = Math.min(Math.max(limit, 1), MAX_FEED_LIMIT)

  const conditions = buildConditions({
    filters,
    minRelevance,
    ...(since !== undefined ? { since } : {}),
  })
  const orderBy = buildOrderBy(filters)

  // ts_headline runs once per row over coalesce(title || ' ' || abstract);
  // the StartSel/StopSel sentinels are ASCII control chars STX (\x02) and
  // ETX (\x03) — see render-highlight.tsx for the matching splitter.
  // MaxFragments=1 picks the best fragment by query density (not the
  // first match).
  //
  // NOTE: the \x02 / \x03 escape sequences are interpreted by the JS engine
  // at compile time, so node-postgres sends raw control-char bytes over the
  // wire. If this SQL ever passes through a logger/middleware that strips
  // or escapes control chars before reaching Postgres, ts_headline will
  // silently fall back to its default <b></b> delimiters and highlights
  // will render as literal text. Don't introduce SQL-stringifying middleware
  // for this query without preserving the sentinel bytes.
  //
  // The `string | null` generic on the sql template is load-bearing: it
  // gives drizzle's inferred select shape the right field type. Removing
  // it would degrade `headline` to `unknown` and break PaperWithHighlight.
  //
  // The ts_headline options string ('StartSel=…,StopSel=…,MaxWords=…') MUST
  // stay a static string literal. Drizzle binds ${papers.title} and
  // ${filters.searchQuery} as $N params, but the options string is rendered
  // inline. Making it dynamic (e.g. per-locale regconfig) would open a SQL-
  // injection vector. If options must vary, build a whitelist enum and
  // branch the entire sql`...` template, never interpolate user input.
  const headlineExpr =
    filters.searchQuery !== null
      ? sql<
          string | null
        >`ts_headline('english', coalesce(${papers.title}, '') || ' ' || coalesce(${papers.abstract}, ''), websearch_to_tsquery('english', ${filters.searchQuery}), 'StartSel=\x02,StopSel=\x03,MaxWords=35,MinWords=15,MaxFragments=1')`
      : sql<string | null>`null::text`

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
      domain: papers.domain,
      createdAt: papers.createdAt,
      headline: headlineExpr,
      // LEFT JOIN projections: absent rows become false. The boolean cast
      // is explicit so drizzle infers the column type as boolean (not
      // unknown). isRead is true ONLY for status='read'; reading/archived
      // count as not-read in A6 per A6-PRD scope (binary read UI).
      isSaved: sql<boolean>`(${userSaves.paperId} is not null)`,
      isRead: sql<boolean>`(${readStatus.status} = 'read')`,
    })
    .from(papers)
    .leftJoin(userSaves, eq(userSaves.paperId, papers.id))
    .leftJoin(readStatus, eq(readStatus.paperId, papers.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(clampedLimit)

  return rows
}

// Single-paper read by canonical id. Mirrors listRecentPapers' LEFT JOIN
// projection so the detail page consumes the same PaperWithUserState shape
// (isSaved/isRead always present, headline always null — no search context
// on detail). Returns null when no row matches; the route maps that to
// notFound() so /papers/badid surfaces a real 404.
export async function getPaperById(id: string): Promise<PaperWithUserState | null> {
  const [row] = await db
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
      domain: papers.domain,
      createdAt: papers.createdAt,
      headline: sql<string | null>`null::text`,
      isSaved: sql<boolean>`(${userSaves.paperId} is not null)`,
      isRead: sql<boolean>`(${readStatus.status} = 'read')`,
    })
    .from(papers)
    .leftJoin(userSaves, eq(userSaves.paperId, papers.id))
    .leftJoin(readStatus, eq(readStatus.paperId, papers.id))
    .where(eq(papers.id, id))
    .limit(1)

  return row ?? null
}

export async function countPapers(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(papers)
  return row?.count ?? 0
}

export async function getDistinctYears(domain?: PaperDomain): Promise<number[]> {
  const yearCondition = sql`${papers.year} IS NOT NULL`
  const where = domain ? and(yearCondition, eq(papers.domain, domain)) : yearCondition
  const rows = await db.selectDistinct({ year: papers.year }).from(papers).where(where)

  return rows
    .map((r) => r.year)
    .filter((y): y is number => y !== null)
    .sort((a, b) => b - a)
}

export interface FilterFacets {
  sources: PaperSource[]
  venueTypes: VenueType[]
  years: number[]
}

// Facets are domain-scoped when `domain` is given (the feed passes the active
// tab), so the sidebar never offers a source/venue/year that yields zero rows
// on the current tab. The saved view omits it — it's cross-domain.
export async function getFilterFacets(domain?: PaperDomain): Promise<FilterFacets> {
  const domainWhere = domain ? eq(papers.domain, domain) : undefined
  const [sourcesRaw, venueTypesRaw, years] = await Promise.all([
    db.selectDistinct({ value: papers.primarySource }).from(papers).where(domainWhere),
    db.selectDistinct({ value: papers.venueType }).from(papers).where(domainWhere),
    getDistinctYears(domain),
  ])

  // Guard against any DB row whose enum value drifted from the canonical
  // set (e.g. legacy rows pre-migration, or a caller that bypassed the
  // upsert path). Without this, an unknown value would render a blank
  // label in the sidebar with no error.
  const sources = sourcesRaw.map((r) => r.value).filter((v): v is PaperSource => SOURCE_SET.has(v))
  const venueTypes = venueTypesRaw
    .map((r) => r.value)
    .filter((v): v is VenueType => VENUE_TYPE_SET.has(v))

  return { sources, venueTypes, years }
}

// Weekly digest executor — runs the pure digest builder's conditions against
// the live DB. Content-only projection (no saved/read LEFT JOINs, no search
// headline). Returns [] when nothing matches; the digest job branches to the
// "quiet week" note on an empty result. Mirrors listRecentPapers' shape.
export async function fetchWeeklyDigestPapers(
  input: BuildDigestQueryInput,
): Promise<DigestPaper[]> {
  const conditions = buildDigestConditions(input)
  const limit = clampDigestLimit(input.limit)

  const rows = await db
    .select({
      id: papers.id,
      title: papers.title,
      authors: papers.authors,
      venue: papers.venue,
      venueType: papers.venueType,
      relevanceScore: papers.relevanceScore,
      relevanceTags: papers.relevanceTags,
      pdfUrl: papers.pdfUrl,
      arxivId: papers.arxivId,
      publishedDate: papers.publishedDate,
      createdAt: papers.createdAt,
      primarySource: papers.primarySource,
      rawMetadata: papers.rawMetadata,
    })
    .from(papers)
    .where(and(...conditions))
    .orderBy(...DIGEST_ORDER_BY)
    .limit(limit)

  return rows
}
