-- A10 — Add 'greatzh' value to the paper_source enum.
-- New source: github.com/greatzh/papers, a hand-curated, actively-maintained
-- image-forgery paper list. See Ideas v5.md.
ALTER TYPE paper_source ADD VALUE IF NOT EXISTS 'greatzh';
