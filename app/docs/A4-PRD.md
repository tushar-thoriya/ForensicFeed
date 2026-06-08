# A4 — Filter sidebar + URL-as-state; sort-by-relevance toggle

**Status:** Draft
**Date:** 2026-05-10
**Owner:** tusharpatel
**Builds on:** A3 (CVF + OpenReview adapters), tagger engine landed in A1/A2 (already wired into ingestion + DB)

## Goal

The feed becomes filterable. From a desktop sidebar (or mobile bottom sheet), I can narrow the feed by venue, year, topic tag, and "has code" — and toggle sort between newest-first and by-relevance. Filter state lives in the URL so a filtered view is bookmarkable and shareable.

**Success shape:** Open `/?tag=localization&hasCode=1&sort=relevance` → feed shows only papers tagged `localization` with `codeUrl` set, sorted by `relevance_score` descending. Clear-all collapses back to `/`. The 50ms client-side filter target only applies to dimension toggles within an already-loaded page; cross-cutting filter changes refetch via Next.js navigation.

## Scope

### In scope

- **Filter sidebar (desktop, primary)** — `FilterSidebar.tsx` rendered to the left of the feed at `>= 1024px`. Five sections: source, venue-type, year, tag, has-code. Plus a sort toggle at the top (newest / relevance).
- **Filter chips row (mobile + desktop)** — active filters render as removable chips above the feed list. Click chip → removes that filter. "Clear all" button when ≥2 chips active.
- **Mobile bottom sheet** — `FilterSheet.tsx`. Trigger button in the feed header opens an overlay sheet with the same controls as the sidebar. Closes on apply, scrim tap, or `Escape`.
- **URL-as-state** — all filter values round-trip through `searchParams`. Server component reads them, client component updates them via `useRouter().push(...)` with `scroll: false`.
- **Extended `listRecentPapers`** — add filter dimensions to `ListOptions`: `sources`, `venueTypes`, `years`, `tags`, `hasCode`, `sortBy: 'newest' | 'relevance'`.
- **Filter parsing utility** — `parseFilterParams(searchParams)` returning a typed `FilterState` with safe defaults; rejects unknown values rather than throwing (filters out junk).
- **Empty state for filtered view** — distinct copy: "No papers match these filters" with a "Clear filters" link.
- **Sort indicator** — subtle label ("newest first" / "most relevant first") under the title, replacing the existing static `newest first` line in `page.tsx`.
- **Unit tests** — `parseFilterParams`, `listRecentPapers` with each filter dimension, clear-all behaviour.
- **E2E test** — Playwright: load feed, open sidebar, toggle "has code", verify URL updates and result count drops; clear-all returns to default.
- **a11y** — sidebar disclosure semantics, sheet focus trap, keyboard-navigable chips with `Escape`-to-clear when focused.

### Out of scope (later)

- Full-text search (`tsvector`) → A5
- Save / read-status filters → A6
- Filter persistence per user (localStorage / DB) → defer; URL is the persistence layer
- Server-side rate limit on filter endpoint → not needed (single user, server component)
- Date-range custom picker → year multi-select is enough for A4
- Tag groups / tag relationships → flat tag list

## Existing state (post-A3, already in repo)

| Piece                                       | File                                | Status                                            |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `scoreRelevance` + `assignTags` engine      | `src/lib/ingestion/tagger.ts`       | ✅ 21 tests; HIGH/MED/LOW keyword tiers; 12 tags  |
| Score + tags written on upsert              | `src/lib/db/queries/papers.ts:50`   | ✅ Every ingested paper auto-scored + auto-tagged |
| `relevanceScore` real column + index        | `src/lib/db/schema.ts:68,81`        | ✅ `papers_relevance_idx` exists                  |
| `relevanceTags` array column                | `src/lib/db/schema.ts`              | ✅ Stored as `text[]`                             |
| Feed page with `minRelevance: 0.2` gate     | `src/app/page.tsx:14`               | ✅ Threshold from `Ideas V4.md §5`                |
| `PaperList` server-rendered                 | `src/components/feed/PaperList.tsx` | ✅ Reuse as-is                                    |
| `PaperCard` shows score, tags, venue badge  | `src/components/feed/PaperCard.tsx` | ✅ Reuse as-is                                    |
| Source enum (8 sources), VenueType enum (5) | `src/lib/db/schema.ts:14,22`        | ✅ Both feed the filter dimensions                |

## Deliverables

| #   | File                                              | Purpose                                                                                                                        |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `src/types/filter.ts` (new)                       | `FilterState`, `SortBy` types; `EMPTY_FILTERS` constant.                                                                       |
| 2   | `src/lib/filters/parse.ts` (new)                  | `parseFilterParams(searchParams) → FilterState`; `serialiseFilters(state) → URLSearchParams`.                                  |
| 3   | `tests/unit/filter-parse.test.ts` (new)           | Round-trip; junk rejection; empty state; CSV multi-value.                                                                      |
| 4   | `src/lib/db/queries/papers.ts` (modified)         | Extend `ListOptions` with filter dimensions; add `sortBy`; convert single-value `gte` chain into `and(...)` of all conditions. |
| 5   | `tests/unit/list-papers.test.ts` (new)            | Each filter dimension narrows results; `sortBy: 'relevance'` orders by score desc; `hasCode` true/false; multi-tag = OR.       |
| 6   | `src/components/filters/FilterSidebar.tsx` (new)  | Desktop sidebar; section accordion; checkbox groups; sort radio.                                                               |
| 7   | `src/components/filters/FilterSheet.tsx` (new)    | Mobile bottom-sheet wrapper; reuses sidebar internals.                                                                         |
| 8   | `src/components/filters/FilterChips.tsx` (new)    | Active-filter chips row; "Clear all" button.                                                                                   |
| 9   | `src/components/filters/filters.css` (new)        | Sidebar layout, sheet animation, chip styling — token-driven, AA contrast.                                                     |
| 10  | `src/components/feed/EmptyState.tsx` (new, small) | Reusable empty-state for "no results" with optional CTA.                                                                       |
| 11  | `src/app/page.tsx` (modified)                     | Read `searchParams`, parse to `FilterState`, pass to `listRecentPapers`, render sidebar + chips + list.                        |
| 12  | `src/app/(feed)/layout.tsx` (new, optional)       | If route grouping needed for sidebar layout — only if `page.tsx` solo gets unwieldy.                                           |
| 13  | `tests/e2e/filters.spec.ts` (new)                 | Toggle has-code, verify URL + result count; clear-all returns to default; mobile sheet open/close.                             |

## Contracts

### `FilterState` shape

```typescript
type SortBy = 'newest' | 'relevance'

interface FilterState {
  sources: PaperSource[] // empty = all
  venueTypes: VenueType[] // empty = all
  years: number[] // empty = all
  tags: Tag[] // empty = all (OR within tags)
  hasCode: boolean | null // null = either; true = code only; false = no-code only
  sortBy: SortBy // default 'newest'
}

// Discriminated identifier for chip-removal callback
type FilterDimension = 'source' | 'venueType' | 'year' | 'tag' | 'hasCode'

interface RemoveFilterArgs {
  dimension: FilterDimension
  value: string | number | null // null only for hasCode toggle-off
}
```

`FilterChips.onRemove(args: RemoveFilterArgs)` is the canonical contract; multi-value dimensions pass the specific item to remove, `hasCode` passes `null`.

### URL contract

| Param       | Format                           | Example                      |
| ----------- | -------------------------------- | ---------------------------- |
| `source`    | CSV                              | `?source=arxiv,cvf`          |
| `venueType` | CSV                              | `?venueType=conference`      |
| `year`      | CSV ints                         | `?year=2024,2025`            |
| `tag`       | CSV                              | `?tag=localization,deepfake` |
| `hasCode`   | `1` / `0` / absent               | `?hasCode=1`                 |
| `sort`      | `newest` (default) / `relevance` | `?sort=relevance`            |

Parser rejects unknown enum values silently (drops them) rather than throwing — keeps the page resilient to bad pasted URLs.

### Extended `listRecentPapers` signature

```typescript
interface ListOptions {
  limit?: number
  minRelevance?: number // existing
  since?: Date // existing
  sources?: PaperSource[]
  venueTypes?: VenueType[]
  years?: number[]
  tags?: Tag[]
  hasCode?: boolean | null
  sortBy?: 'newest' | 'relevance' // default 'newest'
}
```

- Tag filter: **`relevanceTags` is `jsonb`, not `text[]`** (`schema.ts:69`), so `arrayOverlaps` does NOT apply. Use Postgres `?|` operator via raw SQL: `sql\`${papers.relevanceTags} ?| ARRAY[${sql.join(tags.map(t => sql\`${t}\`), sql\`, \`)}]\`` — semantics: "any of these strings is an element of the jsonb array". Verified safe with parameterisation.
- Year filter: `inArray(papers.year, years)`.
- Source / venue filter: `inArray(papers.primarySource, sources)` / `inArray(papers.venueType, venueTypes)`.
- `hasCode === true`: `isNotNull(papers.codeUrl)`. `hasCode === false`: `isNull(papers.codeUrl)`. `null`: skip.
- `sortBy: 'relevance'` orders by `desc(papers.relevanceScore)` then `desc(papers.publishedDate)` as tiebreak.

### FilterSidebar / FilterSheet behaviour

- Sidebar is a **client component** (`'use client'`) because it dispatches navigations.
- Each section is a `<fieldset>` with a `<legend>`; checkboxes labelled by visible text. No invisible-only labels.
- Toggling a checkbox calls `router.push(serialiseFilters(next), { scroll: false })`. No debounce — filter changes are infrequent enough that an extra navigation per click is fine.
- Sheet trigger only renders below `1024px` (CSS `@media`).
- Sheet uses native `<dialog>` element with focus trap and `Escape`-close.

### Empty state copy

- Default empty (no papers ingested yet): "No papers ingested yet — check back after the next ingest run."
- Filtered empty: "No papers match these filters." + "Clear filters" link → `/`.
- Distinguished by checking whether any filter is non-default.

## Done when

- [ ] All filter dimensions narrow `listRecentPapers` results correctly (unit tests cover each).
- [ ] `parseFilterParams` round-trips with `serialiseFilters` (property-style test with random valid input).
- [ ] Sidebar renders at `>= 1024px`; sheet button + sheet at `< 1024px`; both share filter state.
- [ ] URL updates immediately on every checkbox toggle; back/forward replays state correctly.
- [ ] `?sort=relevance` orders feed by score desc; visible sort indicator updates.
- [ ] Filtered empty state shows "Clear filters" link; default empty state shows ingest-pending copy.
- [ ] Active-filter chips appear above feed; click chip removes that filter; "Clear all" appears at ≥2 active.
- [ ] Playwright E2E (Chromium): toggle `hasCode`, verify URL + count drop; mobile viewport opens sheet, applies filter, closes.
- [ ] a11y-architect sweep: sidebar fieldsets, sheet focus trap, chip keyboard navigation, contrast all clean.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test:ci` all pass; new tests added.
- [ ] `code-reviewer` + `typescript-reviewer` pass with no CRITICAL/HIGH open.
- [ ] No file > 400 lines typical / 800 hard max; no function > 50 lines.

## Non-goals / explicit deferrals

- **Search input in sidebar** — full-text search is A5.
- **Save / unread filters** — A6.
- **Filter analytics ("X papers when this is on")** — defer; can add count badges in B-phase if useful.
- **Custom date range picker** — year multi-select is sufficient.
- **Server-side filter caching** — Next.js `dynamic = 'force-dynamic'` already on the page; per-request DB query is fine for single-user load.
- **Tag co-occurrence weights** — stays a flat OR multi-select; no graph relationships.

## Risk notes

- **`relevanceTags` is `text[]`, not enum** — the engine produces from `TAG_ORDER`, but the column has no constraint. Filter UI must source the tag list from the canonical `TAG_ORDER` constant, not from `SELECT DISTINCT unnest(relevance_tags)`, otherwise drift would surface stale or wrong tags.
- **Year list source** — pulling distinct years from DB on every render is fine for now; if it becomes a hot path, materialise into a small `meta` query. For A4: `SELECT DISTINCT year FROM papers ORDER BY year DESC` once at request time. **Empty-DB behaviour:** when `getDistinctYears()` returns `[]`, hide the year section entirely (no empty fieldset). Same rule applies to source/venueType sections if the DB is empty for them.
- **Sidebar at 1024px exactly** — current `--sidebar-width: 280px` token + `--content-max: 860px` totals 1140px. At exactly 1024px the layout will be tight; either tighten content max or breakpoint the sidebar at `1100px` instead. Verify in viewport sweep.
- **`searchParams` in App Router** — Next.js 15 makes `searchParams` a Promise on async pages. Page must `await searchParams` before parsing. Easy to forget; lint via test that hits the page route.
- **Mobile sheet `<dialog>`** — Safari support is now solid (16.4+) but verify polyfill not needed. If issues surface, fall back to `role="dialog"` + manual focus management.
- **Filter UI re-render thrash** — every checkbox toggle causes a server round-trip. Acceptable for now (single user, fast DB), but if it stutters, switch to `useTransition()` with `startTransition()` so the spinner doesn't block input.
