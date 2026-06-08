# A4 — Implementation plan

**Date:** 2026-05-10
**PRD:** `app/docs/A4-PRD.md`
**Approach:** TDD — types/contracts → failing tests → minimal implementation → green. Build inside-out: data layer → URL parser → UI shell → wiring.

## Build order

Each phase ends with `pnpm vitest run` (and where relevant `pnpm typecheck`) green before moving on.

### Phase 1 — Filter types + URL parser (TDD)

| Step | Task                                               | File                                    | Gate                                       |
| ---- | -------------------------------------------------- | --------------------------------------- | ------------------------------------------ |
| 1.1  | Define `FilterState`, `SortBy`, `EMPTY_FILTERS`    | `src/types/filter.ts` (new)             | Compiles; exported types reused everywhere |
| 1.2  | Write parser/serialiser unit tests (RED)           | `tests/unit/filter-parse.test.ts` (new) | Tests fail because parser doesn't exist    |
| 1.3  | Implement `parseFilterParams` + `serialiseFilters` | `src/lib/filters/parse.ts` (new)        | All parser tests green; typecheck clean    |

**Test cases** (1.2):

- Empty `URLSearchParams` → `EMPTY_FILTERS`
- `?source=arxiv,cvf` → `sources: ['arxiv', 'cvf']`
- `?tag=localization,deepfake&hasCode=1` → both tags + `hasCode: true`
- `?sort=relevance` → `sortBy: 'relevance'`
- `?sort=invalid` → `sortBy: 'newest'` (default, no throw)
- `?source=bogus,arxiv` → drops bogus, keeps arxiv (silent reject)
- `?year=2024,abc,2025` → drops `abc`, keeps numeric years
- Round-trip: `serialiseFilters(parseFilterParams(p))` produces same query string for any valid input
- `?hasCode=0` → `hasCode: false` (distinct from absent → `null`)
- **`serialiseFilters(EMPTY_FILTERS)` produces a string with NO `hasCode` param** (null must not serialise to `hasCode=null` or empty value)

### Phase 2 — Extend `listRecentPapers` (TDD)

| Step | Task                                                                                                                                         | File                                    | Gate                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2.1  | Write new query unit tests (RED)                                                                                                             | `tests/unit/list-papers.test.ts` (new)  | Fails — new options not implemented yet                                                               |
| 2.2  | Extend `ListOptions` + apply filters in WHERE — **tag filter uses jsonb `?\|` operator (not `arrayOverlaps`); column is jsonb at schema:69** | `src/lib/db/queries/papers.ts` (modify) | All query tests green; existing upsert tests still green; verified against real Postgres (not mocked) |
| 2.3  | Add `getDistinctYears()` helper for year-multiselect source                                                                                  | `src/lib/db/queries/papers.ts` (modify) | Returns sorted desc array of int years                                                                |

**Test cases** (2.1):

- `sources: ['arxiv']` narrows to arxiv-source rows only
- `venueTypes: ['conference']` narrows to conference rows
- `years: [2024, 2025]` narrows by year
- `tags: ['localization']` returns only papers whose `relevanceTags` overlaps with `['localization']`
- `tags: ['localization', 'deepfake']` is OR (overlap)
- `hasCode: true` returns only papers where `codeUrl IS NOT NULL`
- `hasCode: false` returns only papers where `codeUrl IS NULL`
- `hasCode: null` skips the constraint
- `sortBy: 'relevance'` orders by `relevance_score DESC, published_date DESC`
- `sortBy: 'newest'` (default) orders by `published_date DESC`
- All filters combined work together (AND across dimensions, OR within)
- `minRelevance: 0.2` continues to apply alongside new filters
- `getDistinctYears()` returns sorted desc

These tests use the existing test DB seeding pattern (already used by `multi-source-dedup.test.ts`).

### Phase 3 — Filter UI components

| Step | Task                                                      | File                                              | Gate                                                                        |
| ---- | --------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| 3.1  | Build `FilterChips` (active-filter chips + clear-all)     | `src/components/filters/FilterChips.tsx` (new)    | Renders chips from `FilterState`; chip click invokes `onRemove` callback    |
| 3.2  | Build `FilterSidebar` with section fieldsets + sort radio | `src/components/filters/FilterSidebar.tsx` (new)  | Client component; uses `useRouter`/`useSearchParams`; updates URL on change |
| 3.3  | Build `FilterSheet` mobile bottom-sheet wrapper           | `src/components/filters/FilterSheet.tsx` (new)    | Uses `<dialog>`; trigger button shown `< 1024px`; reuses sidebar internals  |
| 3.4  | Build `EmptyState` reusable component                     | `src/components/feed/EmptyState.tsx` (new, small) | Variant prop: `'no-papers' \| 'no-matches'`; "Clear filters" link variant   |
| 3.5  | Add filters CSS (sidebar layout, sheet animation, chips)  | `src/components/filters/filters.css` (new)        | Token-driven; AA contrast; respects `prefers-reduced-motion`                |

**Component contracts** (3.1–3.4):

- `FilterChips({ filters, onClear })` — pure presentational; `onClear(key, value)` for individual chip removal, `onClearAll()` to reset.
- `FilterSidebar({ filters, sources, venueTypes, years, tags })` — owns navigation; accepts canonical option lists as props (not fetched inside component).
- `FilterSheet({ children })` — wraps `FilterSidebar` in a `<dialog>` on mobile; sidebar content used as-is.
- `EmptyState({ variant })` — receives `'no-papers'` (default copy) or `'no-matches'` (with clear-filters link).

### Phase 4 — Page wiring

| Step | Task                                                                       | File                        | Gate                                                    |
| ---- | -------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| 4.1  | Read + parse `searchParams` in `page.tsx`                                  | `src/app/page.tsx` (modify) | Filters round-trip from URL → query → render            |
| 4.2  | Compose layout: sidebar (≥1024px) / sheet trigger (<1024px) + chips + list | `src/app/page.tsx` (modify) | Visual layout matches PRD shape                         |
| 4.3  | Replace static "newest first" line with sort indicator                     | `src/app/page.tsx` (modify) | Reflects `sortBy` value                                 |
| 4.4  | Use `EmptyState` for filtered-empty vs default-empty                       | `src/app/page.tsx` (modify) | "Clear filters" link visible only when ≥1 filter active |

### Phase 5 — E2E test (Playwright)

| Step | Task                                                         | File                              | Gate                                                                                      |
| ---- | ------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------- |
| 5.1  | Write filter E2E test                                        | `tests/e2e/filters.spec.ts` (new) | Test: open feed, toggle has-code, verify URL + result count drops; clear-all returns home |
| 5.2  | Mobile viewport test: open sheet, apply filter, sheet closes | same file                         | iPhone 14 viewport (390×844)                                                              |

These exercise the dev server (`pnpm dev` running). Skip in CI if Playwright not configured; gate them behind `pnpm e2e` script.

### Phase 6 — Quality gates

| Step | Task                                                              | Gate                                                                    |
| ---- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 6.1  | `pnpm typecheck`                                                  | Clean                                                                   |
| 6.2  | `pnpm lint`                                                       | Clean                                                                   |
| 6.3  | `pnpm test:ci`                                                    | All tests green; A4 unit tests added without regressing 115 existing    |
| 6.4  | `pnpm build`                                                      | Production build succeeds; First Load JS still under 150 KB budget      |
| 6.5  | Parallel reviewer sweep: `code-reviewer` + `typescript-reviewer`  | No CRITICAL/HIGH open                                                   |
| 6.6  | `a11y-architect` sweep on FilterSidebar, FilterSheet, FilterChips | Fieldset/legend semantics, focus trap, contrast, keyboard nav all green |

### Phase 7 — Commit + checkpoint

| Step | Task                                                                                          |
| ---- | --------------------------------------------------------------------------------------------- |
| 7.1  | Conventional commit: `feat(feed): add filter sidebar, URL-as-state, sort-by-relevance toggle` |
| 7.2  | Push to `origin/main`                                                                         |
| 7.3  | Update memory: write `a4-progress.md`, demote `a3-progress.md`, refresh `MEMORY.md`           |

## File estimate

| File                                       | Type   | Est. lines |
| ------------------------------------------ | ------ | ---------- |
| `src/types/filter.ts`                      | new    | ~30        |
| `src/lib/filters/parse.ts`                 | new    | ~120       |
| `tests/unit/filter-parse.test.ts`          | new    | ~150       |
| `src/lib/db/queries/papers.ts`             | modify | +60        |
| `tests/unit/list-papers.test.ts`           | new    | ~220       |
| `src/components/filters/FilterChips.tsx`   | new    | ~80        |
| `src/components/filters/FilterSidebar.tsx` | new    | ~220       |
| `src/components/filters/FilterSheet.tsx`   | new    | ~90        |
| `src/components/filters/filters.css`       | new    | ~180       |
| `src/components/feed/EmptyState.tsx`       | new    | ~40        |
| `src/app/page.tsx`                         | modify | +60        |
| `tests/e2e/filters.spec.ts`                | new    | ~120       |

**No file approaches the 800-line cap.** Heaviest is `FilterSidebar.tsx` at ~220 lines; well under target.

## Risk gates

- **`searchParams` is async in Next 15:** parser must `await searchParams` before accessing values. Catch via TS strict; verify in unit test that uses `await Promise.resolve(params)` shape.
- **Hydration mismatch on client sidebar:** since sidebar is client, server-rendered initial state must match. Pass parsed `filters` from page → sidebar as a prop rather than re-parsing on the client.
- **Tag list source drift:** import `TAG_ORDER` from `tagger.ts` directly into the sidebar; do NOT query DB for distinct tags (unenforced jsonb could surface stale values).
- **`relevanceTags` is jsonb, not text[]:** verified at `schema.ts:69`. Tag filter MUST use the jsonb `?\|` operator (`column ?\| ARRAY['a','b']`), not drizzle's `arrayOverlaps` (which emits PG `&&` for true Postgres arrays only). Phase 2 implementation must use `sql\`${papers.relevanceTags} ?\| ARRAY[...]\``. Test with real DB, not mock — a mocked query layer would silently pass invalid SQL.
- **Year list refresh frequency:** `getDistinctYears()` runs every page render. Acceptable for now; if hot, materialise into a small in-memory cache with `unstable_cache` or fold into a dedicated `meta` query. **Empty result → hide year section entirely** (no empty fieldset). Same rule for source/venueType.
- **`<dialog>` Safari support:** target `>= 16.4`. If issues surface during E2E, fall back to `role="dialog"` + manual focus trap. Check during Phase 5.
- **Filter UI re-render cost:** every checkbox toggle triggers a server round-trip. Acceptable at single-user scale; if it stutters, wrap navigation in `startTransition()`.
- **Sidebar breakpoint:** `--sidebar-width: 280px` + `--content-max: 860px` totals 1140px. At 1024px exactly, layout will be tight. Decision: **use 1100px breakpoint** for sidebar (override default `1024px` reference) to avoid pinching. Document in `filters.css`.

## Time estimate

~4–6 hours focused dev. Phase 1 + 2 (data layer) is the bulk; Phase 3 is the largest LOC block but mostly mechanical CSS + JSX; Phase 4 is integration glue.

## Definition of done

Mirrors `A4-PRD.md "Done when"`. All 11 boxes ticked before commit.
