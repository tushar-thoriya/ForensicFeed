-- A5 — Add full-text search.
--
-- `search_vector` is a generated tsvector column maintained by Postgres
-- (GENERATED ALWAYS AS ... STORED). Title is weighted A (higher), abstract B.
-- The column is intentionally NOT declared in src/lib/db/schema.ts — see
-- docs/A5-PRD.md "scope" section. All app-side references go through raw
-- `sql\`search_vector\`` fragments in list-papers-query.ts so the column
-- never bloats `Paper.$inferSelect` with raw tsvector strings.
--
-- Generated columns backfill automatically on ALTER ADD COLUMN, so existing
-- rows get a populated search_vector without a separate UPDATE step.
--
-- If drizzle-kit later suggests dropping this column or the index during an
-- introspection diff, DO NOT accept the suggestion — drizzle-kit cannot see
-- generated columns and will incorrectly mark them as orphaned.

ALTER TABLE "papers"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("abstract", '')), 'B')
  ) STORED;
--> statement-breakpoint

CREATE INDEX "papers_search_idx" ON "papers" USING gin("search_vector");
