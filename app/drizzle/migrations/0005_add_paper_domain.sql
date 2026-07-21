-- A11 — Paper domain split: 'forgery' (default, the user's research focus) vs
-- 'deepfake' (face-swap / face-forgery / synthetic-face detection). Existing
-- rows default to 'forgery'; /api/admin/backfill-domain reclassifies them.
CREATE TYPE paper_domain AS ENUM ('forgery', 'deepfake');
--> statement-breakpoint
ALTER TABLE papers ADD COLUMN IF NOT EXISTS domain paper_domain NOT NULL DEFAULT 'forgery';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS papers_domain_idx ON papers (domain);
