import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const venueType = pgEnum('venue_type', [
  'arxiv',
  'conference',
  'journal',
  'workshop',
  'preprint',
])

export const paperSource = pgEnum('paper_source', [
  'arxiv',
  'paperswithcode',
  'semantic_scholar',
  'cvf',
  'openreview',
  'huggingface',
])

export const readStatusValue = pgEnum('read_status_value', [
  'unread',
  'reading',
  'read',
  'archived',
])

export const ingestStatus = pgEnum('ingest_status', ['running', 'success', 'partial', 'failed'])

export const papers = pgTable(
  'papers',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    authors: jsonb('authors').$type<string[]>().notNull().default([]),
    abstract: text('abstract'),

    arxivId: text('arxiv_id'),
    doi: text('doi'),
    titleHash: text('title_hash').notNull(),

    venue: text('venue'),
    venueType: venueType('venue_type').notNull().default('arxiv'),
    year: integer('year'),

    publishedDate: timestamp('published_date', { withTimezone: true }).notNull(),
    updatedDate: timestamp('updated_date', { withTimezone: true }),

    pdfUrl: text('pdf_url'),
    codeUrl: text('code_url'),
    citationCount: integer('citation_count'),

    relevanceScore: real('relevance_score').notNull().default(0),
    relevanceTags: jsonb('relevance_tags').$type<string[]>().notNull().default([]),

    primarySource: paperSource('primary_source').notNull(),
    rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    arxivIdUniq: uniqueIndex('papers_arxiv_id_uniq').on(t.arxivId),
    doiUniq: uniqueIndex('papers_doi_uniq').on(t.doi),
    titleHashUniq: uniqueIndex('papers_title_hash_uniq').on(t.titleHash),
    publishedIdx: index('papers_published_idx').on(t.publishedDate),
    relevanceIdx: index('papers_relevance_idx').on(t.relevanceScore),
    sourceIdx: index('papers_source_idx').on(t.primarySource),
  }),
)

export const userSaves = pgTable(
  'user_saves',
  {
    paperId: text('paper_id')
      .notNull()
      .references(() => papers.id, { onDelete: 'cascade' }),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.paperId] }),
    savedAtIdx: index('user_saves_saved_at_idx').on(t.savedAt),
  }),
)

export const readStatus = pgTable(
  'read_status',
  {
    paperId: text('paper_id')
      .notNull()
      .references(() => papers.id, { onDelete: 'cascade' }),
    status: readStatusValue('status').notNull().default('unread'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.paperId] }),
    statusIdx: index('read_status_status_idx').on(t.status),
  }),
)

export const ingestRuns = pgTable(
  'ingest_runs',
  {
    id: text('id').primaryKey(),
    source: paperSource('source').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    papersFetched: integer('papers_fetched').notNull().default(0),
    papersInserted: integer('papers_inserted').notNull().default(0),
    papersUpdated: integer('papers_updated').notNull().default(0),
    status: ingestStatus('status').notNull().default('running'),
    errorMessage: text('error_message'),
  },
  (t) => ({
    sourceTimeIdx: index('ingest_runs_source_time_idx').on(t.source, t.startedAt),
  }),
)

export type Paper = typeof papers.$inferSelect
export type NewPaper = typeof papers.$inferInsert
export type IngestRun = typeof ingestRuns.$inferSelect
export type NewIngestRun = typeof ingestRuns.$inferInsert
