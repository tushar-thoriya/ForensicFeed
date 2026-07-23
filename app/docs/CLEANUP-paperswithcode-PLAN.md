# CLEANUP — Remove `paperswithcode` from code and database

**Status:** DONE — executed 2026-07-23. DB migration applied to production & verified
(enum now 6 values, 889 rows intact); code gates green (typecheck/lint/331 tests).
**Type:** maintenance / schema cleanup

---

## 1. Objective

Fully remove the unused `paperswithcode` paper source from the codebase **and** the
production database `paper_source` enum, leaving code and DB in sync (no drift).

## 2. Background

- Papers With Code was **never implemented** as an ingestion source — there is no
  adapter, no Inngest job, no schedule entry. It exists only as an enum value and a
  few type/label references.
- Migration `0002` deliberately left the value in place ("to avoid breaking any rows").
  This plan **supersedes** that decision now that we've confirmed **0 rows** use it.
- Postgres has **no `ALTER TYPE ... DROP VALUE`**, so the enum must be **recreated**.

## 3. Pre-flight facts (verified against production)

| Fact | Value |
|---|---|
| `papers` rows using `paperswithcode` | **0** |
| `ingest_runs` rows using `paperswithcode` | **0** |
| Columns using `paper_source` | `papers.primary_source`, `ingest_runs.source` |
| Column defaults on those columns | **none** (both `NOT NULL`, no default) |
| Views / matviews depending on the type | **none** |
| Current enum order | `arxiv, paperswithcode, semantic_scholar, cvf, openreview, huggingface, greatzh` |
| Target enum order | `arxiv, semantic_scholar, cvf, openreview, huggingface, greatzh` |

Because nothing uses the value and nothing depends on the type, the migration is a
straightforward, low-risk, **atomic** type-recreation.

---

## 4. Part A — Code changes (4 files)

1. **`src/lib/db/schema.ts`** — remove the `'paperswithcode',` line from the
   `paperSource = pgEnum('paper_source', [...])` array.
2. **`src/types/paper.ts`** — remove the `| 'paperswithcode'` member from the
   `PaperSource` union type.
3. **`src/lib/filters/labels.ts`** — remove both:
   - the `paperswithcode: 'PapersWithCode',` entry from the source-label map, and
   - the `'paperswithcode',` entry from the `SOURCE_VALUES` array.
4. **`tests/unit/source-link.test.ts`** — remove the
   `expect(getSourceBadge('paperswithcode', {})).toBeNull()` assertion. Once the union
   drops the value, passing `'paperswithcode'` is a **type error**, so this line must go
   (replace with an existing valid source if a "no-badge" case is still desired, e.g.
   `'arxiv'`).

**Do NOT touch** (immutable history / generated):
- `drizzle/migrations/0000_init.sql`, `drizzle/migrations/0002_*.sql`
- `drizzle/migrations/meta/0000_snapshot.json`
- docs (`A2-PRD.md`, `B2-PRD.md`, `SKILL.md`) — historical references, leave as-is.

## 5. Part B — Database migration

New file: **`drizzle/migrations/0006_remove_paperswithcode_source.sql`**

```sql
-- 0006 — Remove the unused 'paperswithcode' value from the paper_source enum.
-- Never implemented as a source (superseded by Hugging Face; see 0002). 0 rows use
-- it. Postgres has no DROP VALUE, so the enum is recreated inside one transaction
-- for all-or-nothing safety.

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
```

### How to apply
The file has **no `--> statement-breakpoint`** markers on purpose, so it runs as one
atomic batch. Two options:

- **Preferred — Supabase SQL Editor:** paste the SQL, run once, read the result. Gives
  immediate, explicit control over this delicate change.
- **Or via the repo runner:** `node bin/apply-migration.mjs 0006_remove_paperswithcode_source.sql`

The `USING primary_source::text::paper_source` cast rewrites the two tables (~889 rows
total → sub-second). Both take a brief `ACCESS EXCLUSIVE` lock — negligible for a
single-user app.

---

## 6. Execution order

1. `git checkout main && git pull` → branch `chore/remove-paperswithcode`.
2. Make the 4 **code** edits (Part A) + add the **migration file** (Part B).
3. Gates: `pnpm typecheck && pnpm lint && pnpm vitest run` — all green.
4. **Apply the DB migration** to production (Supabase SQL Editor).
5. **Verify** (section 7).
6. Commit → PR → merge → deploy.

> Ordering note: because 0 rows use the value and nothing writes it, code-vs-DB order
> is **not** runtime-sensitive. Doing the migration and deploy close together simply
> keeps the definitions tidy. This is the reverse of the huggingface/greatzh drift we
> fixed — here we remove from **both** sides, so they stay in sync.

## 7. Verification

- **DB enum:**
  ```sql
  select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
  where t.typname='paper_source' order by e.enumsortorder;
  ```
  Expect exactly: `arxiv, semantic_scholar, cvf, openreview, huggingface, greatzh`.
- **Data intact:** `select count(*) from papers;` → still **889**; feed loads; no errors.
- **Code:** typecheck/lint/tests green; `grep -rn paperswithcode src` → only historical
  migration files remain.

## 8. Rollback

If anything looks wrong after applying:
```sql
ALTER TYPE paper_source ADD VALUE IF NOT EXISTS 'paperswithcode';
```
(Re-adds the value; it lands at the end of the order, which is functionally irrelevant.)
Then revert the code PR. Because the forward migration is transactional, a mid-migration
failure rolls back automatically — the enum/columns are never left half-changed.

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Rows still using the value | — | Guard clause aborts the txn; verified 0/0 |
| Table rewrite lock | Low | ~889 rows, sub-second; single-user app |
| Code/DB drift | Low | Remove from **both** sides in the same PR/apply |
| Editing migration history | Med | Forbidden — new `0006` file only; never touch `0000`/`0002` |
| Future `drizzle-kit generate` mismatch | Low | Code enum now matches DB enum → no diff |
