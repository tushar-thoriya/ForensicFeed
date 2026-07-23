-- 0006 — Remove the unused 'paperswithcode' value from the paper_source enum.
-- Never implemented as a source (superseded by Hugging Face; see 0002). 0 rows use
-- it. Postgres has no DROP VALUE, so the enum is recreated inside one transaction
-- for all-or-nothing safety. Runs as a single atomic batch.

BEGIN;

-- Guard: abort if any row still references the value (expected 0).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM papers WHERE primary_source = 'paperswithcode')
     OR EXISTS (SELECT 1 FROM ingest_runs WHERE source = 'paperswithcode') THEN
    RAISE EXCEPTION 'Aborting: rows still reference paperswithcode';
  END IF;
END $$;

ALTER TYPE paper_source RENAME TO paper_source_old;

CREATE TYPE paper_source AS ENUM (
  'arxiv', 'semantic_scholar', 'cvf', 'openreview', 'huggingface', 'greatzh'
);

ALTER TABLE papers
  ALTER COLUMN primary_source TYPE paper_source
  USING primary_source::text::paper_source;

ALTER TABLE ingest_runs
  ALTER COLUMN source TYPE paper_source
  USING source::text::paper_source;

DROP TYPE paper_source_old;

COMMIT;
