-- 0007 — Rename the paper_source value 'greatzh' to 'greatzh_repo' for clarity:
-- these papers come from the greatzh/papers GitHub repo, not a website. Postgres
-- supports renaming an enum value in place (catalog-only, no table rewrite), so
-- unlike a removal this is a single trivial statement.
--
-- APPLY ORDER: this value is actively written by the greatzh adapter, so the new
-- code (which writes 'greatzh_repo') must be DEPLOYED before this runs. Apply it
-- right after deploy and before the weekly greatzh run (Mondays 06:00 UTC).

ALTER TYPE paper_source RENAME VALUE 'greatzh' TO 'greatzh_repo';
