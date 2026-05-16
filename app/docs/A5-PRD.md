# A5 — Full-text search via Postgres `tsvector`

**Status:** Draft
**Date:** 2026-05-16
**Owner:** tusharpatel
**Builds on:** A4 (filter sidebar + URL-as-state + relevance sort, committed `5bf9683`)

## Goal

A persistent search box above the feed. Typing narrows the feed to papers whose title or abstract matches the query, ranked by Postgres `ts_rank_cd` so the best matches surface first. Matched terms are highlighted inline. Search composes with all existing A4 filters; the URL carries `?q=` alongside `?source=&tag=&...` so any combination is shareable.

**Success shape:** Open `/?q=copy-move%20localization&tag=localization&hasCode=1` → feed shows only papers tagged `localization`, with code, where title or abstract matches `copy-move` AND `localization`; results ranked by relevance to the query; "copy-move" and "localization" highlighted in title and abstract excerpt. Clearing the input collapses to current filter state. Search input and filters round-trip across reload, back/forward, and direct URL paste.

## Scope

### In scope

- **`papers.search_vector` column** — `tsvector` generated from `title` + `abstract` (title weighted higher), via Postgres `GENERATED ALWAYS AS (...) STORED`. No trigger needed; column maintains itself on every row write.
- **GIN index** on `search_vector` — `CREATE INDEX papers_search_idx ON papers USING gin(search_vector)`.
- **Hand-written migration only** — `drizzle/migrations/0003_add_search_vector.sql`. **The column is NOT declared in `schema.ts`.** Postgres maintains it; the app references it via raw `sql\`search_vector\`` fragments inside the query builder (same pattern as A4's `jsonb ?|` tag-overlap operator at `list-papers-query.ts:31-38`). Reasons:
  1. Declaring it would force `db.select()` to include `searchVector` in every row, bloating every Paper transfer with raw `tsvector` strings the app never uses.
  2. `Paper.$inferSelect` would gain a noisy `searchVector` field every consumer would have to ignore.
  3. drizzle-kit's introspection of generated columns is imperfect — keeping the migration authoritative avoids regenerate-time drift.
- **Query parser** — `parseSearchQuery(raw)` produces a canonical normalised string + a Postgres `tsquery` parameter. Empty / whitespace-only inputs collapse to `null`. Uses `websearch_to_tsquery('english', ...)` so `"quoted phrases"`, `-exclude`, and `OR` work out of the box and bad syntax never errors.
- **Extended `FilterState`** — add `searchQuery: string | null`. `EMPTY_FILTERS.searchQuery = null`. `isFiltered` returns true when `searchQuery !== null`.
- **URL contract** — `?q=` parameter, URL-encoded user input as-is. `parseFilterParams` and `serialiseFilters` round-trip the field.
- **`listRecentPapers` extension** — when `filters.searchQuery !== null`, AND a `search_vector @@ websearch_to_tsquery('english', $q)` condition into the WHERE clause.
- **Ranking when searching** — when `searchQuery !== null` AND no `?sort=` param in URL, default sort flips to `ts_rank_cd(search_vector, query) DESC`, then `desc(published_date)` as tiebreak. Explicit `?sort=relevance` still wins (sort by `relevanceScore` desc) — user choice overrides the implicit search-rank default. Explicit `?sort=newest` also wins. **This requires tri-state sort:** `SortBy = 'newest' | 'relevance' | null` where `null` means "no explicit param set" — without this we can't distinguish "user clicked newest-radio" from "URL has no sort". The sort radio default UI option is "newest" but the underlying state is `null` until the user clicks.
- **Highlighted excerpts** — `ts_headline('english', concat(title, ' ', abstract), query, 'StartSel=\x02,StopSel=\x03,MaxWords=35,MinWords=15')` returned as a separate column when `searchQuery !== null`. Client splits on the sentinel and renders `<mark>` around hits — no `dangerouslySetInnerHTML`, no HTML sanitiser. **Sentinels are ASCII control chars `STX` (`\x02`) and `ETX` (`\x03`)** — categorically impossible in any PDF-extracted or XML-parsed paper abstract; printable-Unicode brackets like `⟦`/`⟧` are real codepoints that could legitimately appear in a math-heavy abstract, so we use control chars to be structurally safe.
- **`SearchInput.tsx`** — controlled input, debounced (`300ms`) via `useTransition`. On debounced change, calls `router.replace(serialiseFilters(next), { scroll: false })` (replace, not push — typing shouldn't pollute history; back goes back to pre-search state).
- **Clear-search "X"** button inside the input (rendered when `value.length > 0`); also `Escape` while focused clears.
- **Empty state for no-results** — distinct variant: "No papers match '{query}'." with a "Clear search" link that removes `q` while preserving other filters.
- **Result-count subhead** updates to `N results for "query" · ranked by match` when searching; falls back to `N papers · newest first` otherwise.
- **Server-component flow stays intact** — search is a search-param-driven re-render, same pattern as filters. No client-side fetch; no TanStack Query needed.
- **Unit tests** — `parseSearchQuery` handles empty/whitespace/junk; `parseFilterParams` round-trips `q`; `buildConditions` adds the `@@` condition only when `searchQuery !== null`; `buildOrderBy` flips to `ts_rank_cd` when searching and no explicit sort.
- **Integration tests** — `list-papers-query.test.ts` extended to verify compiled SQL contains `search_vector @@ websearch_to_tsquery` and `ts_rank_cd` only when expected.
- **E2E test** — Playwright: type query in input, wait for URL `?q=`, verify result count drops, verify a `<mark>` exists; press `Escape`, verify input + URL clear.
- **a11y** — `<input type="search">` with associated `<label>` (`htmlFor`); `aria-describedby` pointing at the result-count `role="status"`; `<mark>` is semantically correct for highlight (no extra ARIA needed). Clear button has `aria-label`.

### Out of scope (later)

- Save / read-status filters → A6
- Per-source search restriction (search only arXiv) → already achievable via combining `?q=` with `?source=`; no special UI needed
- Multi-language stemming (only `english` dictionary used) → defer
- Synonym dictionary (`thesaurus`) → defer
- Stored search-history dropdown → defer to Phase B
- Search analytics ("you searched for X 5 times") → not personal-app priority
- Author / venue / year field-scoped search (`venue:cvpr`) → defer; `?venueType=`/`?year=` already do this
- Typeahead suggestions → defer
- AI / semantic / vector search → out of scope for entire Phase A; explicitly Phase B

## Existing state (post-A4, already in repo)

| Piece | File | Status |
|---|---|---|
| `FilterState`, `EMPTY_FILTERS`, `isFiltered` | `src/types/filter.ts` | ✅ Extend `FilterState` with `searchQuery: string \| null` |
| `parseFilterParams` / `serialiseFilters` | `src/lib/filters/parse.ts` | ✅ Extend to handle `q` |
| `buildConditions`, `buildOrderBy`, `buildListPapersQuery` | `src/lib/db/queries/list-papers-query.ts` | ✅ Extend to add `@@` condition + flip default order |
| `listRecentPapers` | `src/lib/db/queries/papers.ts` | ✅ Extend to select `ts_headline` excerpt when searching |
| `FeedPage` server component | `src/app/page.tsx` | ✅ Reuse; SearchInput drops in above filters |
| `FilterPanel` orchestrator | `src/components/filters/FilterPanel.tsx` | ✅ Reuse; SearchInput is sibling, not child |
| `EmptyState` | `src/components/feed/EmptyState.tsx` | ✅ Extend with `no-search-matches` variant |
| `PaperCard` | `src/components/feed/PaperCard.tsx` | ✅ Extend to accept optional `highlightedTitle`/`highlightedExcerpt` |
| Drizzle migration runner | `src/lib/db/client.ts` + migration folder | ✅ Add `0002_add_search_vector.sql` |
| Test infrastructure (Vitest + Playwright) | repo root | ✅ Reuse |

## Deliverables

| # | File | Purpose |
|---|---|---|
| 1 | `drizzle/migrations/0003_add_search_vector.sql` (new) | Add `search_vector` generated column + GIN index. |
| 2 | `src/lib/db/schema.ts` | **No change.** Column is intentionally NOT declared in drizzle schema (see scope §1). All references go through raw `sql\`search_vector\`` in the query builder. |
| 3 | `src/types/filter.ts` (modified) | Add `searchQuery: string \| null` to `FilterState`; change `SortBy` to tri-state `'newest' \| 'relevance' \| null`; update `EMPTY_FILTERS.sortBy = null`; update `isFiltered` to include `searchQuery !== null`. |
| 4 | `src/lib/search/parse-query.ts` (new) | `parseSearchQuery(raw: string \| null) → string \| null`. Trims, collapses whitespace, returns null for empty. |
| 5 | `src/lib/filters/parse.ts` (modified) | `parseFilterParams` reads `q`; `serialiseFilters` writes `q`. |
| 6 | `src/lib/db/queries/list-papers-query.ts` (modified) | `buildConditions` AND-s `search_vector @@ websearch_to_tsquery(...)` when searching. `buildOrderBy` flips default to `ts_rank_cd` desc when searching with no explicit sort. |
| 7 | `src/lib/db/queries/papers.ts` (modified) | `listRecentPapers` returns `PaperWithHighlight[]` always; when searching, the `headline` field is populated via `ts_headline`; otherwise `headline: null`. Use `db.select({ ...paperColumns, headline: sql<string | null>... }).from(papers)` so the inferred return type is stable across both code paths. |
| 8 | `src/types/paper.ts` (modified) | Add `PaperWithHighlight = Paper & { headline: string \| null }` (non-optional — always present, null when not searching, so consumers can assume the field exists). |
| 8a | `src/app/page.tsx` + `src/components/feed/PaperList.tsx` + any test fixtures (modified) | Change `Paper[]` annotations to `PaperWithHighlight[]` wherever they appear as the return-type of `listRecentPapers`. |
| 9 | `src/lib/search/render-highlight.tsx` (new) | Pure helper that splits headline string on `⟦HL⟧` / `⟦/HL⟧` sentinels and returns a React fragment with `<mark>` wrappers. No HTML parsing. |
| 10 | `src/components/search/SearchInput.tsx` (new) | Controlled `<input type="search">` with `useTransition`-debounced URL sync. Clear button, `Escape`-to-clear. |
| 11 | `src/components/search/search.css` (new) | Search input layout, focus ring, clear-button placement, `<mark>` styling. |
| 12 | `src/components/feed/PaperCard.tsx` (modified) | Accept optional `highlightedTitle` / `highlightedExcerpt` ReactNode; fall back to plain title/abstract. |
| 13 | `src/components/feed/EmptyState.tsx` (modified) | Add `no-search-matches` variant with `query` prop and "Clear search" link. |
| 14 | `src/app/page.tsx` (modified) | Render `<SearchInput>` above the feed-header; pass to `listRecentPapers`; pick empty-state variant based on whether `searchQuery !== null`. |
| 15 | `tests/unit/parse-query.test.ts` (new) | Empty / whitespace / huge / unicode / SQL-injection-attempt inputs all yield safe normalised output. |
| 16 | `tests/unit/filter-parse.test.ts` (modified) | Add cases for `q` round-trip + empty `q` dropped. |
| 17 | `tests/unit/list-papers.test.ts` (modified) | Extended assertions: `@@` appears only with `searchQuery`; `ts_rank_cd` appears in ORDER BY only when searching with no explicit sort. |
| 18 | `tests/unit/render-highlight.test.tsx` (new) | Sentinel splitting; no-match passes through; nested sentinels (invalid input) degrade gracefully. |
| 19 | `tests/e2e/search.spec.ts` (new) | Type "forgery", wait for `?q=forgery`, expect result count change, expect `<mark>`, `Escape` to clear. |

## Contracts

### `FilterState` extension

```typescript
type SortBy = 'newest' | 'relevance' | null   // tri-state: null = no explicit sort param

interface FilterState {
  sources: PaperSource[]
  venueTypes: VenueType[]
  years: number[]
  tags: Tag[]
  hasCode: boolean | null
  sortBy: SortBy
  searchQuery: string | null   // NEW — null when input is empty
}
```

`isFiltered` returns true when `searchQuery !== null` so an empty filtered result triggers the "no matches" empty state.

**`sortBy` tri-state migration from A4:** A4's `SortBy = 'newest' | 'relevance'` becomes `'newest' | 'relevance' | null` with `EMPTY_FILTERS.sortBy = null`. The sort-radio UI still shows "Newest" as the default visual state when `sortBy === null`, but the underlying parsed state distinguishes "user explicitly chose newest" (`'newest'`) from "no choice made" (`null`). This is the only way `buildOrderBy` can default to `ts_rank_cd` when searching without overriding an explicit "give me newest, not rank" user preference.

### URL contract

| Param | Format | Example |
|---|---|---|
| `q` | URL-encoded raw user string | `?q=copy-move+localization` |

- Whitespace-only or empty `q` is dropped on serialise — `?q=&tag=foo` round-trips to `?tag=foo`, never `?q=`.
- `parseSearchQuery` normalises:
  - `null` / `undefined` / empty / whitespace-only → `null`
  - Otherwise → `trim()` + collapse internal whitespace runs to single space
  - Length cap: 200 chars (truncate, no error — defensive, far longer than any sensible query)

### `parseSearchQuery` contract

```typescript
export function parseSearchQuery(raw: string | null | undefined): string | null
```

| Input | Output |
|---|---|
| `null` / `undefined` | `null` |
| `""` | `null` |
| `"   "` | `null` |
| `"copy-move"` | `"copy-move"` |
| `"  copy  move  "` | `"copy move"` |
| 250-char string | first 200 chars after trim |
| `"'); DROP TABLE papers;--"` | `"'); DROP TABLE papers;--"` (no escaping needed — passed as bind param to `websearch_to_tsquery`, which is grammar-only and ignores SQL syntax) |
| Unicode `"déjà vu"` | `"déjà vu"` (Postgres `english` config tokenises ASCII; non-ASCII passes through as a literal token — no match but no crash) |

### Extended `listRecentPapers` signature

```typescript
export interface ListOptions {
  filters?: FilterState
  limit?: number
  minRelevance?: number
  since?: Date
}

export type PaperWithHighlight = Paper & { headline?: string | null }

export async function listRecentPapers(options: ListOptions = {}): Promise<PaperWithHighlight[]>
```

- When `filters.searchQuery === null`: behaviour unchanged from A4. Returned rows have no `headline`.
- When `filters.searchQuery !== null`:
  - WHERE adds: `search_vector @@ websearch_to_tsquery('english', $q)`
  - SELECT adds: `ts_headline('english', coalesce(title, '') || ' ' || coalesce(abstract, ''), websearch_to_tsquery('english', $q), 'StartSel=\x02,StopSel=\x03,MaxWords=35,MinWords=15,MaxFragments=1') AS headline`
  - ORDER BY when `sortBy === null` (no explicit user choice): `ts_rank_cd(search_vector, websearch_to_tsquery('english', $q)) DESC, published_date DESC`
  - ORDER BY when `sortBy === 'relevance'`: `relevanceScore desc, published_date desc` (user override wins)
  - ORDER BY when `sortBy === 'newest'`: `published_date desc` (user override wins)
- **Multiple `websearch_to_tsquery` calls per query:** the same expression appears in WHERE, ORDER BY, and the headline SELECT. Postgres does not auto-CSE these. At limit 50 the cost is negligible; if perf surfaces, refactor to a CTE: `WITH q AS (SELECT websearch_to_tsquery('english', $q) AS tsq) SELECT ... FROM papers, q WHERE search_vector @@ q.tsq ORDER BY ts_rank_cd(search_vector, q.tsq) DESC`. Deferred for A5 — known minor inefficiency.

### Highlight rendering

`ts_headline` returns a single string with sentinels: `"…copy-move \x02localization\x03 in deepfake images…"`.

`renderHighlight(text)` returns React: `<>…copy-move <mark>localization</mark> in deepfake images…</>`.

Algorithm:
1. Split on a single regex covering both sentinels: `/[\x02\x03]/`.
2. Walk segments tracking "are we inside a highlight" via a flag toggled on each split boundary (since splitting on the regex consumes both delimiters, we toggle on every chunk; this works because `\x02` always precedes a highlight and `\x03` always closes one — but we use a simpler robust form: split into pairs around `\x02...\x03`).
3. Final algorithm (robust):
   - Match `/\x02([^\x03]*)\x03/g` to find highlighted regions.
   - Walk the string, emitting plain text between matches and `<mark>` for each match.
   - Lone `\x02` or `\x03` (defensive: should never occur) is stripped or rendered as text — never crashes.
4. If no sentinels present, return text unchanged in a single fragment.

No HTML parsing, no `dangerouslySetInnerHTML`, no sanitiser dependency. Control chars are categorically impossible in any real paper abstract (PDF/XML extraction strips them).

### `SearchInput` behaviour

- `'use client'` component.
- Controlled value. Accepts `initialValue: string` prop = parsed/normalised `FilterState.searchQuery ?? ''` (not raw URL string — must match what `parseSearchQuery` would produce, so input display stays in sync with URL state across reloads).
- Debounce: 300ms via `setTimeout` + `useRef<NodeJS.Timeout | null>` for cancellation (not a `useDebounce` hook — keep it dependency-free).
- On debounced change → `router.replace(serialiseFilters(nextFilters), { scroll: false })`. `replace` not `push` because keystrokes shouldn't fill history.
- Submit on `Enter`: **`clearTimeout(timerRef.current)` BEFORE calling `router.push`** to avoid race: if Enter fires while a debounce timer is already queued, the timer's `router.replace` would land after the push and silently strip the new history entry. Order matters.
- Clear button (visible when value.length > 0): clears value and immediately pushes empty-`q` URL (also clears any pending debounce timer first).
- `Escape` key while focused: clears (same teardown order).
- Visible `<label htmlFor="search">` for a11y; `aria-describedby` points at the result-count `role="status"` element in page header so screen readers announce result changes.
- Loading state is implicit via Next.js navigation; no spinner inside the input. If user feedback is noticeably laggy, wrap navigation in `startTransition` and show `useTransition`'s `isPending` as a subtle dim on the result subhead — defer unless needed.

### Empty-state variant additions

- `no-papers`: "No papers ingested yet — check back after the next ingest run." (unchanged)
- `no-matches`: "No papers match these filters." + "Clear filters" link → `/` (unchanged)
- `no-search-matches`: "No papers match '{query}'." + "Clear search" link → URL with `q` removed but other filters preserved (NEW)

Selection: `searchQuery !== null && papers.length === 0` → `no-search-matches`. Else if `isFiltered` → `no-matches`. Else → `no-papers`.

## Schema migration

```sql
-- drizzle/migrations/0003_add_search_vector.sql

ALTER TABLE papers
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(abstract, '')), 'B')
  ) STORED;

CREATE INDEX papers_search_idx ON papers USING gin(search_vector);
```

- `setweight` so title hits outrank abstract hits in `ts_rank_cd`.
- Generated column = no trigger to maintain, no application code to keep in sync, no chance of drift.
- GIN index = sub-millisecond on tens of thousands of rows.

## Done when

- [ ] Migration applied; `search_vector` column populated for all existing rows automatically (generated columns backfill on `ALTER`).
- [ ] `parseSearchQuery` unit tests pass (8+ cases).
- [ ] `parseFilterParams` round-trips `q` including empty-drop.
- [ ] `listRecentPapers({ filters: { ..., searchQuery: 'forgery' } })` returns ranked results with `headline` field populated.
- [ ] Compiled SQL test asserts `@@ websearch_to_tsquery` and `ts_rank_cd` appear only when searching.
- [ ] `<mark>` tags render around matched terms in feed; no `dangerouslySetInnerHTML` anywhere.
- [ ] URL syncs on debounced typing; `Enter` pushes immediately; `Escape` clears.
- [ ] Clear-search link in empty state removes `q` while preserving other filters.
- [ ] Search composes with filters: `?q=foo&tag=localization&hasCode=1` narrows by all three.
- [ ] Playwright E2E: type, observe URL + count + `<mark>`, clear via `Escape`.
- [ ] a11y-architect sweep clean: input labelled, clear button labelled, `<mark>` semantic, focus visible.
- [ ] `pnpm typecheck`, `pnpm test:ci`, `pnpm build` all pass.
- [ ] `code-reviewer` + `typescript-reviewer` + `database-reviewer` + `security-reviewer` pass with no CRITICAL/HIGH open.
- [ ] No file > 400 lines typical / 800 hard max; no function > 50 lines.

## Non-goals / explicit deferrals

- **Field-scoped search (`venue:cvpr`, `author:foo`)** — defer; current filters cover venue/year, and author search isn't a real need yet.
- **Multi-language stemming** — `english` only; almost all papers are in English.
- **Synonym handling** — would help ("tamper" → "forgery") but defer until evidence of missed papers.
- **Saved searches** — defer to Phase B; URL is already shareable.
- **Typeahead suggestions** — defer; the input is for users who know what they're looking for.
- **Highlighting in paper detail page** — out of scope; detail page does not yet exist (A7). When it lands, it can reuse `renderHighlight` and re-query with `headline`.
- **Search analytics** — explicitly not building this in a personal-use phase.
- **Fuzzy / typo-tolerant matching (`pg_trgm`)** — defer; `websearch_to_tsquery` stemming covers most variants (`forgery` matches `forgeries`).

## Risk notes

- **`tsvector` generated column requires Postgres 12+** — Supabase ships Postgres 15+, so safe. Local dev DB must be ≥12 (it is).
- **Generated-column backfill on `ALTER`** — for a large table this rewrites every row. With current ingest size (<10k rows expected in Phase A), runs in seconds. If table grows: defer migration to a quieter time or use `CREATE INDEX CONCURRENTLY` + separate column-add. For now: single migration is fine.
- **`ts_headline` is moderately expensive** — runs per returned row. With `limit 50` and an indexed search, total cost is small. If perf surfaces an issue, move `ts_headline` into a second query that only fetches headlines for visible rows, or precompute snippets at ingest. For A5: ship simple.
- **Sentinel choice** — `\x02` (STX) and `\x03` (ETX) ASCII control characters. Categorically impossible in any real published paper: PDF text extraction strips control chars, XML and JSON parsers reject them, every ingestion adapter we use produces text via one of these paths. Postgres preserves them as bytes in `text` columns regardless. Initial PRD draft used printable Unicode brackets `⟦`/`⟧` (U+27E6/U+27E7) but architect review flagged these as real codepoints that a math-heavy abstract could legitimately contain. Control chars are structurally safer.
- **`websearch_to_tsquery` error tolerance** — unlike `to_tsquery`, it never throws on bad syntax. Verified in Postgres docs. This is why we use it instead of `plainto_tsquery` (which also doesn't throw but doesn't support phrases / exclusion).
- **Highlight in already-highlighted text** — `ts_headline` only operates on the *input* string; we pass title + abstract concatenated. The card UI then renders that headline next to (or instead of) the original title. To avoid visual confusion, when `headline` is present we render it in the **abstract slot only**, keeping the plain title in the title slot. Title-only highlighting can be added later if useful.
- **Debounce vs `useTransition`** — `useTransition` alone is not a debounce; it just marks the update as low-priority. We still need a `setTimeout`-based debounce for the URL push, otherwise every keystroke is a Next.js navigation. Use both: debounce the navigation, transition the resulting re-render.
- **Enter / Clear race vs debounce timer** — every code path that calls `router.push` or `router.replace` outside the debounce timer (Enter, clear button, Escape) MUST `clearTimeout(timerRef.current)` BEFORE the navigation call. Otherwise a queued debounce timer can fire after the immediate navigation and silently replace the just-created history entry. Cover this with a focused unit test if practical (timer mocking with `vi.useFakeTimers`).
- **Tri-state sort migration** — A4 stored `sortBy: 'newest' | 'relevance'` with `'newest'` as the default. Changing to `'newest' | 'relevance' | null` with `null` as default is a small breaking change. `pnpm typecheck` will catch all call sites (page.tsx sort indicator, FilterSidebar radio, FilterChips display, serialiseFilters). For radio display, treat `null` and `'newest'` identically (default visual). For chips display, only show a "Sort: relevance" chip when `sortBy === 'relevance'` — `null` and `'newest'` produce no chip.
- **`searchVector` not in drizzle schema** — accessed only via raw `sql\`search_vector\`` in `list-papers-query.ts`. This is intentional (avoids bloating `Paper.$inferSelect`). The cost is that drizzle-kit's introspection diff for this table will show a "column not in schema" warning. Document this in the migration comment so future-us doesn't try to "fix" it.
- **`router.replace` clobbers in-page state** — feed is server-component-rendered, no in-page client state to lose. Safe. If we later add client-side pagination or scroll restoration, revisit.
- **Migration generation** — drizzle-kit can't introspect generated columns cleanly. Hand-write `0002_add_search_vector.sql` and run via the existing migration path (or directly via `supabase migration up`). Add a `db:generate` skip-marker so drizzle-kit doesn't try to revert it on next generation.
- **Test infra for tsvector** — unit tests for the compiled SQL string (via `PgDialect.sqlToQuery` as in A4) verify shape without touching a DB. Integration test requires a live Postgres with the migration applied; out of scope for unit, in scope for the E2E test which uses the dev DB.
- **Empty `q` in URL** — must be dropped by `serialiseFilters`, otherwise `?q=` (empty) is technically `searchQuery === ""` which the parser treats as `null`, but the URL shows a junk param. Cover with a round-trip test.
