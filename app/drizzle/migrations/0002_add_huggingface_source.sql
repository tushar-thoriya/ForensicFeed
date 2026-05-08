-- A2 — Add 'huggingface' value to the paper_source enum.
-- Hugging Face Papers replaces Papers With Code (paperswithcode.com migrated to HF).
-- The 'paperswithcode' enum value is left in place to avoid breaking any rows
-- that may have been written under the old plan; it is unused by current code.
ALTER TYPE paper_source ADD VALUE IF NOT EXISTS 'huggingface';
