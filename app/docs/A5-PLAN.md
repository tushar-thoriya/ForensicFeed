# A5 — Implementation plan

**Date:** 2026-05-16
**PRD:** `app/docs/A5-PRD.md`
**Approach:** TDD inside-out. Migration first (DB shape locked), then types/parser, then query layer, then UI, then E2E. Each phase ends with `pnpm vitest run` (and `pnpm typecheck` where relevant) green before moving on.

## Build order

### Phase 1 — Migration (no schema.ts change)

| Step | Task | File | Gate |
|---|---|---|---|
| 1.1 | Hand-write migration: `search_vector` generated column + GIN index | `drizzle/migrations/0003_add_search_vector.sql` (new) | Runs cleanly on local dev DB; `SELECT search_vector FROM papers LIMIT 1` returns non-null for rows with title/abstract |
| 1.2 | Apply migration to dev DB via the existing drizzle-kit / supabase pipeline | (CLI step) | Migration recorded in `drizzle/meta/_journal.json` |
| 1.3 | Verify backfill: `SELECT count(*) FROM papers WHERE search_vector IS NULL` | (manual SQL via Supabase Studio or psql) | Returns 0 (generated columns backfill automatically on `ALTER ADD COLUMN`) |
| 1.4 | Verify GIN index usage: `EXPLAIN SELECT * FROM papers WHERE search_vector @@ websearch_to_tsquery('english', 'forgery')` | (manual SQL) | Plan shows `Bitmap Index Scan on papers_search_idx` |

**Decision: do NOT declare `searchVector` in `schema.ts`.** Per architect review issue #6, declaring it would force every `db.select()` to fetch the column (bloating `Paper` rows with raw `tsvector` strings the app never uses) and would pollute `Paper.$inferSelect` with a noisy field. All references go through raw `sql\`search_vector\`` fragments in `list-papers-query.ts`, identical to A4's `tagOverlapCondition` pattern. The migration file is the authoritative source for the column's existence.

Add a comment at the top of `0002_add_search_vector.sql` noting: "Column intentionally NOT declared in drizzle schema — see A5-PRD.md scope. Do not delete it if drizzle-kit suggests doing so during introspection."

### Phase 2 — Query parser (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 2.1 | Write `parseSearchQuery` unit tests (RED) | `tests/unit/parse-query.test.ts` (new) | Tests fail — function doesn't exist |
| 2.2 | Implement `parseSearchQuery` | `src/lib/search/parse-query.ts` (new) | All cases green |

**Test cases** (2.1, ~10 cases):
- `null` → `null`
- `undefined` → `null`
- `''` → `null`
- `'   '` → `null`
- `'\t\n'` → `null`
- `'copy-move'` → `'copy-move'`
- `'  copy  move  '` → `'copy move'` (trim + collapse internal whitespace)
- `'a'.repeat(250)` → string of length 200
- `"'); DROP TABLE papers;--"` → passes through unchanged (not our job to escape; bind-param handles it)
- `'déjà vu'` → `'déjà vu'` (preserve unicode)
- `'  '.repeat(100)` → `null` (whitespace-only after trim)

### Phase 3 — Extend FilterState + URL parser (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 3.1 | Change `SortBy` to tri-state `'newest' \| 'relevance' \| null`; add `searchQuery: string \| null`; update `EMPTY_FILTERS` (`sortBy: null, searchQuery: null`); update `isFiltered` | `src/types/filter.ts` (modify) | `pnpm typecheck` reveals all call sites needing update |
| 3.2 | Update every `FilterState`-typed object literal in tests + code; update `parseFilterParams` sort logic (absent param → `null`, `'newest'` → `'newest'`, `'relevance'` → `'relevance'`, junk → `null`); update `serialiseFilters` sort logic (`null` and `'newest'` both omit `sort` param? or only `null` omits? — decide: **`null` omits, explicit `'newest'` writes `sort=newest`** to preserve user intent in URL) | (multiple files) | Build green |
| 3.3 | Extend `parseFilterParams` + `serialiseFilters` for `q` | `src/lib/filters/parse.ts` (modify) | New round-trip cases below |
| 3.4 | Update FilterSidebar sort radio: when `sortBy === null` or `'newest'`, "Newest" radio is selected; clicking "Newest" sets `sortBy = 'newest'` (explicit) | `src/components/filters/FilterSidebar.tsx` (modify) | Radio behaviour visible in dev |
| 3.5 | Update FilterChips: "Sort: relevance" chip only when `sortBy === 'relevance'`; no chip for `null` or `'newest'` | `src/components/filters/FilterChips.tsx` (modify) | Chips render |
| 3.6 | Add `q` + tri-state sort cases to existing parser test | `tests/unit/filter-parse.test.ts` (modify) | Green |

**New test cases** (3.4, additive — existing 29 must still pass):
- `?q=forgery` → `searchQuery: 'forgery'`
- `?q=` → `searchQuery: null` (empty string drops)
- `?q=%20%20` → `searchQuery: null` (whitespace drops)
- `?q=copy-move%20localization` → `searchQuery: 'copy-move localization'`
- `serialiseFilters({ ...EMPTY_FILTERS, searchQuery: 'foo' })` → contains `q=foo`
- `serialiseFilters({ ...EMPTY_FILTERS, searchQuery: null })` → does NOT contain `q=`
- `serialiseFilters({ ...EMPTY_FILTERS, searchQuery: '' })` → does NOT contain `q=` (empty-drop applies on serialise too)
- Round-trip: `parseFilterParams(serialiseFilters({ ...EMPTY_FILTERS, searchQuery: 'forgery' }))` equals the input
- `isFiltered({ ...EMPTY_FILTERS, searchQuery: 'foo' })` → `true`
- `isFiltered({ ...EMPTY_FILTERS, searchQuery: null })` → `false`

### Phase 4 — Query layer extension (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 4.1 | Write extended SQL-shape tests (RED) | `tests/unit/list-papers.test.ts` (modify) | Tests fail because new condition + order paths don't exist |
| 4.2 | Extend `buildConditions` to AND `search_vector @@ websearch_to_tsquery('english', $q)` when `searchQuery !== null` (raw `sql\`search_vector\`` reference — column not in drizzle schema) | `src/lib/db/queries/list-papers-query.ts` (modify) | Green; existing 15 unit tests still pass |
| 4.3 | Extend `buildOrderBy` to flip to `ts_rank_cd(sql\`search_vector\`, websearch_to_tsquery('english', $q)) DESC` when `searchQuery !== null` AND `sortBy === null` | `src/lib/db/queries/list-papers-query.ts` (modify) | Green |
| 4.4 | Verify `dialect.sqlToQuery` correctly captures the bind param for `$q` inside the ORDER BY fragment (architect issue #3) | `tests/unit/list-papers.test.ts` (modify) | Compiled params array contains the query string |
| 4.5 | Add `PaperWithHighlight = Paper & { headline: string \| null }` type (non-optional — always present) | `src/types/paper.ts` (modify) | Compiles |
| 4.6 | Update `listRecentPapers` to use explicit `db.select({ ...papers, headline: sql<string \| null>... })` so return type is stable across search/no-search paths; emit `sql\`null::text\`` for headline when no search | `src/lib/db/queries/papers.ts` (modify) | `listRecentPapers` returns `PaperWithHighlight[]` always |
| 4.7 | Update all `Paper[]` annotations that consume `listRecentPapers` to `PaperWithHighlight[]` (page.tsx:37 at minimum; grep for others) | (multiple files) | Typecheck green |

**New test cases** (4.1, ~8 additional):
- Compiled SQL contains `websearch_to_tsquery` when `searchQuery !== null`
- Compiled SQL does NOT contain `websearch_to_tsquery` when `searchQuery === null` (regression guard)
- Compiled params include the literal query string when searching
- Compiled params include the literal query string in BOTH the WHERE bind and the ORDER BY bind when searching with no explicit sort (verify count of param occurrences)
- Order BY contains `ts_rank_cd` when `searchQuery !== null` AND `sortBy === null` (no explicit user sort — implicit flip to rank)
- Order BY contains `published_date desc` (no `ts_rank_cd`) when `searchQuery !== null` AND `sortBy === 'newest'` (explicit user override wins)
- Order BY contains `relevance_score desc` when `searchQuery !== null` AND `sortBy === 'relevance'` (explicit user override wins)
- Order BY contains `published_date desc` only (no `ts_rank_cd`) when `searchQuery === null` regardless of sortBy state (other than 'relevance')

**Note:** Headline SELECT is tested in the integration test (Phase 6 E2E), not in the unit SQL-shape test — the SQL-shape builder verifies WHERE + ORDER BY composition, but the headline is added at the `db.select({...})` layer in `papers.ts`. Cover that with a focused `listRecentPapers` shape test if practical.

### Phase 5 — UI: SearchInput + highlight renderer (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 5.1 | Write `renderHighlight` unit tests (RED) | `tests/unit/render-highlight.test.tsx` (new) | Tests fail — function doesn't exist |
| 5.2 | Implement `renderHighlight` | `src/lib/search/render-highlight.tsx` (new) | All cases green |
| 5.3 | Build `SearchInput.tsx` — accepts `initialValue: string` (normalised, not raw); every immediate navigation path (Enter, clear, Escape) calls `clearTimeout(timerRef.current)` BEFORE the navigation call (architect issue #4 race fix) | `src/components/search/SearchInput.tsx` (new) | Client component; debounced URL sync; clear button; Escape clears; no race observed in dev |
| 5.4 | Add search CSS | `src/components/search/search.css` (new) | Token-driven; focus ring; clear-button placement; `<mark>` background |
| 5.5 | Extend `PaperCard` to accept optional highlighted excerpt | `src/components/feed/PaperCard.tsx` (modify) | Falls back to plain abstract when no headline |
| 5.6 | Add `no-search-matches` variant to `EmptyState` | `src/components/feed/EmptyState.tsx` (modify) | Renders query and clear-search link |

**`renderHighlight` test cases** (5.1, ~7 cases — using `\x02` / `\x03` sentinels):
- No sentinels in input → returns the original string in a fragment
- Single hit: `'foo \x02bar\x03 baz'` → `<>foo <mark>bar</mark> baz</>`
- Multiple hits: `'a \x02b\x03 c \x02d\x03'` → two `<mark>` elements
- Sentinel at start: `'\x02x\x03 y'`
- Sentinel at end: `'x \x02y\x03'`
- Unbalanced opening sentinel (defensive): `'foo \x02bar'` → renders `'foo bar'` (strip lone `\x02`, never crash)
- Unbalanced closing sentinel (defensive): `'foo bar\x03'` → renders `'foo bar'` (strip lone `\x03`)
- Empty string → empty fragment
- `null` → empty fragment (defensive — `headline` is `string | null`)

### Phase 6 — Page wiring + E2E (TDD where it makes sense)

| Step | Task | File | Gate |
|---|---|---|---|
| 6.1 | Render `<SearchInput>` above filter panel in `page.tsx`; pass `searchQuery` to `listRecentPapers` | `src/app/page.tsx` (modify) | Manual smoke: typing in input updates URL + result count |
| 6.2 | Wire empty-state variant: `no-search-matches` when `searchQuery !== null && papers.length === 0` | `src/app/page.tsx` (modify) | Visible in browser |
| 6.3 | Pass headline (when present) into `PaperCard` as `highlightedExcerpt` | `src/components/feed/PaperList.tsx` (modify if needed) or `page.tsx` | `<mark>` visible in feed |
| 6.4 | Write Playwright E2E | `tests/e2e/search.spec.ts` (new) | Green |

**E2E test cases** (6.4, ~3 cases):
- Type `forgery` in input → wait 400ms → URL contains `?q=forgery` → result count text changes → at least one `<mark>` exists in feed
- Press `Escape` while input focused → input clears → URL `q` removed → count returns to unfiltered total
- Click clear-search link in `no-search-matches` empty state → URL `q` removed → original filter (e.g. `tag=foo`) preserved

### Phase 7 — Quality gates

| Step | Task | Gate |
|---|---|---|
| 7.1 | `pnpm typecheck` | Clean |
| 7.2 | `pnpm test:ci` | All tests green; A5 unit tests added without regressing existing 100+ tests |
| 7.3 | `pnpm build` | Production build succeeds; First Load JS still under 150 KB budget |
| 7.4 | Parallel reviewer sweep: `code-reviewer` + `typescript-reviewer` + `database-reviewer` + `security-reviewer` | No CRITICAL/HIGH open |
| 7.5 | `a11y-architect` sweep on `SearchInput`, highlighted `<mark>`, empty state | Labelled input, labelled clear button, semantic mark, focus visible |
| 7.6 | Manual viewport check: 390 / 768 / 1024 / 1440 | Search input full-width on mobile; inline with filters on desktop |

### Phase 8 — Commit + checkpoint

| Step | Task |
|---|---|
| 8.1 | Conventional commit: `feat(search): add full-text search with tsvector, ranking, and highlight` |
| 8.2 | Push to `origin/main` |
| 8.3 | Update memory: write `a5-progress.md`, demote `a4-progress.md`, refresh `MEMORY.md` |

## File estimate

| File | Type | Est. lines |
|---|---|---|
| `drizzle/migrations/0003_add_search_vector.sql` | new | ~10 |
| `src/lib/db/schema.ts` | modify | +10 |
| `src/types/filter.ts` | modify | +5 |
| `src/types/paper.ts` | modify | +5 |
| `src/lib/search/parse-query.ts` | new | ~30 |
| `src/lib/search/render-highlight.tsx` | new | ~40 |
| `src/lib/filters/parse.ts` | modify | +20 |
| `src/lib/db/queries/list-papers-query.ts` | modify | +30 |
| `src/lib/db/queries/papers.ts` | modify | +25 |
| `src/components/search/SearchInput.tsx` | new | ~120 |
| `src/components/search/search.css` | new | ~80 |
| `src/components/feed/PaperCard.tsx` | modify | +15 |
| `src/components/feed/EmptyState.tsx` | modify | +20 |
| `src/app/page.tsx` | modify | +15 |
| `tests/unit/parse-query.test.ts` | new | ~80 |
| `tests/unit/render-highlight.test.tsx` | new | ~80 |
| `tests/unit/filter-parse.test.ts` | modify | +60 |
| `tests/unit/list-papers.test.ts` | modify | +90 |
| `tests/e2e/search.spec.ts` | new | ~100 |

**No file approaches the 800-line cap.** Heaviest new file: `SearchInput.tsx` at ~120 lines.

## Risk gates

- **Generated column on existing schema:** Postgres `ALTER TABLE ... ADD COLUMN ... GENERATED ALWAYS AS (...) STORED` rewrites the entire table. With current dev/prod row counts (well under 10k expected in Phase A), this completes in seconds. Mitigation: run during a quiet window. No issue at A5 scale.
- **Drizzle-kit generated-column blindness:** drizzle-kit will not include the generated column in its introspection diffs. If a future schema change runs `drizzle-kit generate`, it may show "column not in schema" warnings or attempt a drop in the next generated migration. Mitigation: keep `0002_add_search_vector.sql` as the authoritative source; do NOT declare the column in `schema.ts` (architectural decision); explicitly check every future drizzle-kit-generated migration for accidental drops of `search_vector` or `papers_search_idx` before running.
- **Sentinel choice:** `\x02` / `\x03` control chars rather than printable Unicode. Confirmed structurally impossible in any real abstract (PDF/XML/JSON extraction strips them). Lone-sentinel handling in `renderHighlight` strips orphan chars defensively.
- **`ts_headline` cost per row:** acceptable at limit 50. Mitigation if perf issues surface later: move headline to a second query that only fetches headlines for visible rows.
- **`websearch_to_tsquery` quirks:** `"OR"` is case-sensitive (lowercase `or` is just a token). Documented behaviour; we don't promise advanced syntax in the UI, but it works for power users who know.
- **Sentinel collision:** astronomically unlikely. Renders degrade to extra `<mark>` boundaries, not crash.
- **Hydration mismatch in SearchInput:** input is client; initial value must match server-parsed `searchQuery`. Pass `initialValue` prop from server-rendered `page.tsx` AS THE NORMALISED STRING (`FilterState.searchQuery ?? ''`), not the raw URL value — otherwise display can diverge from parsed state across reloads.
- **`router.replace` vs `router.push`:** replace prevents history pollution from keystrokes. Submit on `Enter` should push (explicit search = history entry). Documented in PRD.
- **Enter / Clear / Escape race vs queued debounce timer:** any immediate navigation MUST `clearTimeout(timerRef.current)` BEFORE calling `router.push`/`replace`. Otherwise the debounce timer can fire after the explicit nav and silently overwrite the history entry. Cover with a unit test using `vi.useFakeTimers()` if practical.
- **Debounce + `useTransition` confusion:** these are different tools. Debounce delays the navigation; `useTransition` (if added) marks the resulting re-render as low-priority. Use debounce for the navigation; only add `useTransition` if input feels laggy.
- **`PaperWithHighlight` return-type propagation:** changing `listRecentPapers` return type means every consumer (`page.tsx:37`, any test fixture) must update. Use typecheck to surface — grep for `Paper[]` first before changing.
- **Triple `websearch_to_tsquery` evaluation:** WHERE + ORDER BY + SELECT each call it once with the same arg. Postgres doesn't CSE these. Known minor inefficiency at A5 scale; deferred. If perf surfaces, refactor to a CTE: `WITH q AS (SELECT websearch_to_tsquery('english', $q) AS tsq) ...`.
- **Empty `q` in URL:** must be dropped on both parse and serialise. Covered by tests.
- **Mock-DB risk:** unit SQL-shape tests use `PgDialect.sqlToQuery` (no DB connection, no schema validation). A test that compiles fine can still produce SQL that fails at runtime. Mitigate by adding at least one E2E that exercises the real query path against the dev DB.
- **`ts_headline` requires non-null input:** wrap title/abstract in `coalesce(..., '')`. Already specified in PRD.
- **Headline length:** `MaxWords=35,MinWords=15,MaxFragments=1` keeps the snippet to roughly one sentence. Tune if too short/long after first usage.

## Time estimate

~4–6 hours focused dev. Phase 1 (migration) is the highest-risk phase but smallest in code. Phase 4 (query layer) is the bulk of the technical work. Phase 5 (UI) is mostly mechanical.

## Definition of done

Mirrors `A5-PRD.md "Done when"`. All 13 boxes ticked before commit.
