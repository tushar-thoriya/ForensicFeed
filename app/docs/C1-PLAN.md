# Domain Tabs: "Forgery & Localization" (default) / "Deepfakes"

## Context

The user's focus is document/image forgery detection & localization, but they don't want to fully cancel out deepfake research. Today deepfake papers are **already fetched** (arXiv searches "deepfake"; HF/S2/OpenReview/CVF run "deepfake detection" queries) and are commingled in the single feed — there is no domain concept anywhere. This feature splits the app into two URL-persisted top tabs on the feed, defaulting to forgery.

**User decisions (locked):**
- UI = top tabs on the feed; default tab = Forgery & Localization.
- Weekly email digest stays **forgery-only**.
- Deepfake sources = greatzh repo (un-skip its "Face Forgery" + "Video Forgery" sections) + broadened arXiv terms; other adapters' incidental deepfake papers just get classified.
- **Overlap rule: forgery wins ties.** A paper with forgery-core substance (localization, splicing, document, …) goes to the Forgery tab even if it's about faces. Each paper lives in exactly one tab.

## Key repo facts (verified)

- `upsertPaper` (`app/src/lib/db/queries/papers.ts` ~57–109) recomputes `relevanceScore`/`relevanceTags` on insert AND update → compute `domain` there with the same refresh semantics. Adapters never touch the DB; a hint must travel on `NormalisedPaper`.
- Migrations are hand-written SQL applied via `node bin/apply-migration.mjs` (idempotent codes tolerated). Latest: `0004_add_greatzh_source.sql` (uncommitted) — follow its pattern.
- "Clear all" navigates to `EMPTY_FILTERS` in **two** places: `FilterChipsBar.tsx:53` and `FilterSidebar.tsx:181` — both must preserve `filters.domain` or clearing on the Deepfakes tab silently switches tabs.
- `SearchInput`/`FilterPanel`/`FilterChipsBar` all round-trip the full FilterState through `parseFilterParams`/`serialiseFilters` → domain is preserved automatically once parse/serialise know it.
- No `tsx`/`ts-node` runner in package.json → backfill must be an admin API route (reuse the `x-ingest-secret` + `safeEqual` pattern from `src/lib/inngest/manual-trigger.ts`), not a bin script.
- `Paper = typeof papers.$inferSelect` → adding the column makes typecheck flag every explicit projection (`listRecentPapers`, `getPaperById`, `listSavedPapers`) — use that as the checklist.
- greatzh fixture (`tests/fixtures/greatzh-readme.md`) has a "Face Forgery" section (arxivId 2601.12111) but no "Video Forgery"; adapter test asserts 7 papers today.
- Scoring: "face forgery detection" already hits HIGH `'forgery detection'` (0.4); only non-"detection" phrasings need help.

## Steps (TDD each step: red → green → refactor)

### 0. Migration + schema + types (first — everything depends on it)
- **Create `app/drizzle/migrations/0005_add_paper_domain.sql`**:
  ```sql
  CREATE TYPE paper_domain AS ENUM ('forgery', 'deepfake');
  --> statement-breakpoint
  ALTER TABLE papers ADD COLUMN IF NOT EXISTS domain paper_domain NOT NULL DEFAULT 'forgery';
  --> statement-breakpoint
  CREATE INDEX IF NOT EXISTS papers_domain_idx ON papers (domain);
  ```
- **`app/src/types/paper.ts`**: `export type PaperDomain = 'forgery' | 'deepfake'`; add optional `domainHint?: PaperDomain` to `NormalisedPaper`.
- **`app/src/lib/db/schema.ts`**: `paperDomain` pgEnum + `domain` column (notNull, default 'forgery') + `papers_domain_idx` index.
- Deploy order: apply 0005 to the DB **before** deploying code that selects `papers.domain`.

### 1. `classifyDomain` — new pure module
- **Create `app/src/lib/ingestion/domain.ts`**: `classifyDomain({title, abstract}, hint?): PaperDomain`.
- Precedence (implements "forgery wins ties", including over a deepfake hint):
  1. `hint === 'forgery'` → return `'forgery'`.
  2. Lowercase `title + ' ' + (abstract ?? '')`. If any `FORGERY_OVERRIDES` match → `'forgery'` (even when `hint === 'deepfake'` — e.g. a "face forgery localization via splicing" paper filed under greatzh's Face Forgery section still belongs on the user's default tab).
  3. If `hint === 'deepfake'` or any `DEEPFAKE_SIGNALS` match → `'deepfake'`.
  4. Else `'forgery'` (matches column default).
- Keyword lists:
  ```ts
  const DEEPFAKE_SIGNALS = ['deepfake', 'face swap', 'faceswap', 'face forgery',
    'face manipulation', 'face reenactment', 'facial reenactment', 'talking head',
    'lip sync', 'lip-sync', 'facial attribute editing', 'synthetic face',
    'fake face', 'face generation', 'face x-ray']
  const FORGERY_OVERRIDES = ['document', 'passport', 'id card', 'identity document',
    'receipt', 'splicing', 'copy-move', 'copy move', 'inpainting',
    'image harmonization', 'image tampering', 'image forensics',
    'forgery localization', 'tamper localization', 'tampering localization',
    'manipulation localization', 'text forgery', 'text tampering']
  ```
  Deliberately excluded: `'video forgery'` (generic video tampering is forgery; greatzh's section is handled by hint) and `'face anti-spoofing'` (different problem).
- **Create `app/tests/unit/domain-classify.test.ts`**: pure deepfake → deepfake; pure forgery → forgery; no signals → forgery; tie ("Face Forgery Localization…") → forgery; deepfake hint + forgery override → forgery; forgery hint wins; null abstract; case-insensitivity.

### 2. Scoring (minimal)
- **`app/src/lib/ingestion/tagger.ts`** `MEDIUM_KEYWORDS`: add `'face forgery'`, `'face swap'`, `'face reenactment'` (keep existing narrower phrases; summing scorer rewards detection-phrased titles). Forgery-feed ranking untouched.
- Update `app/tests/unit/relevance.test.ts`: "face forgery identification" title ≥ 0.2; a plain document-forgery title unchanged.

### 3. `upsertPaper` computes domain
- **`app/src/lib/db/queries/papers.ts`**: `const domain = classifyDomain(relevanceInput, input.domainHint)`; add to insert `.values` and to update `setFields` (same refresh semantics as score/tags; comment that a greatzh hint wins on cross-source dedup — curator placement is authoritative, subject to forgery overrides).
- Add `domain: papers.domain` to `listRecentPapers` and `getPaperById` projections (typecheck enforces).
- Update `app/tests/unit/upsert-paper.test.ts`: insert sets domain; update refreshes; hint respected.

### 4. greatzh adapter: section→domain map
- **Fixture** `app/tests/fixtures/greatzh-readme.md`: add `### Video Forgery` section with one task-list bullet + arXiv link.
- **Tests first** (`greatzh-adapter.test.ts`): Face Forgery (2601.12111) + new Video Forgery entry now returned with `domainHint: 'deepfake'`; forgery sections get `domainHint: 'forgery'`; Backbone/Object Detection still skipped; count 7 → 9.
- **`app/src/lib/ingestion/adapters/greatzh.ts`**: replace `ALLOWED_SECTIONS` Set with exported `SECTION_DOMAIN: ReadonlyMap<string, PaperDomain>` (lowercased keys; 9 existing → 'forgery'; 'face forgery', 'video forgery' → 'deepfake'). In `parseGreatzhReadme`, `sectionAllowed: boolean` becomes `currentDomain: PaperDomain | null` (heading-level inheritance unchanged). Set `domainHint` on each paper. Update the header comment (face-swap no longer out of scope).

### 5. arXiv adapter terms
- **`app/src/lib/ingestion/adapters/arxiv.ts`** `FORGERY_TERMS`: add `'face swap'`, `'faceswap'`, `'face reenactment'` (note: existing `'forgery'`/`'manipulation'` already match "face forgery"/"face manipulation" at arXiv word level). No existing test asserts the query string.

### 6. FilterState + URL
- **`app/src/types/filter.ts`**: `domain: PaperDomain` (non-nullable) on FilterState; `EMPTY_FILTERS.domain = 'forgery'`; `isFiltered` unchanged (a tab is a view, not a filter); no chip/`RemoveFilterArgs` entry (sortBy precedent).
- **`app/src/lib/filters/parse.ts`**: parse `domain=deepfake` → 'deepfake', anything else → 'forgery'; serialise only when non-default (clean default URL).
- Update `app/tests/unit/filter-parse.test.ts`: parse/garbage/absent cases, serialise-omits-default, round-trip table gains deepfake cases; the two literal FilterState objects (~lines 166–183) gain `domain`.

### 7. Query builders
- **`app/src/lib/db/queries/list-papers-query.ts`**: `BuildListPapersInput` gains `ignoreDomain?: boolean`; `buildConditions` pushes `eq(papers.domain, filters.domain)` unless ignored.
- **`app/src/lib/db/queries/saved-papers.ts`**: pass `ignoreDomain: true` (saved is a personal cross-domain library); add `domain` to projection.
- **`app/src/lib/db/queries/digest-query.ts`**: `buildDigestConditions` adds `eq(papers.domain, 'forgery')` — digest stays forgery-only with no change to `weekly-digest.ts`.
- Tests: `list-papers.test.ts` (default param 'forgery', 'deepfake' when set, absent with ignoreDomain — existing condition-count assertions shift by one); `digest-query.test.ts` (params include 'forgery').

### 8. Domain-scoped facets
- **`papers.ts`** `getFilterFacets(domain?: PaperDomain)`: when provided, add `eq(papers.domain, domain)` to both distinct queries + years. Feed passes `filters.domain`; saved calls with no arg.

### 9. UI: DomainTabs
- **Create `app/src/components/nav/DomainTabs.tsx`** — server component, Link-based, mirroring `FeedNav` (aria-current="page" on active; NOT role="tab"). Props: `{ filters: FilterState }`; per-tab href = `serialiseFilters({...filters, domain})` → `/` when empty else `/?${qs}`. Labels: "Forgery & Localization" / "Deepfakes". Switching preserves all other filters/search.
- **Create `app/src/components/nav/domain-tabs.css`** using tokens from `feed-nav.css` (accent underline active state, `:focus-visible` outline, ≥44px touch targets via padding).
- **`app/src/app/page.tsx`**: render DomainTabs in `feed-header` between title block and SearchInput; swap `feed-subtitle` copy per domain (deepfake: "Deepfake, face-swap, and synthetic-face detection research."); pass `getFilterFacets(filters.domain)`.
- **`FilterChipsBar.tsx:53`** and **`FilterSidebar.tsx:181`**: clear-all → `{ ...EMPTY_FILTERS, domain: filters.domain }`.
- `/saved`: no DomainTabs; `ignoreDomain` makes stray params inert — no page change.

### 10. Backfill (admin route)
- Export `safeEqual` from `src/lib/inngest/manual-trigger.ts`.
- **Create `app/src/app/api/admin/backfill-domain/route.ts`** (POST, `force-dynamic`, nodejs; guarded by `x-ingest-secret` vs `INGEST_TRIGGER_SECRET`, same pattern incl. unset-in-dev allowance). Keyset-paginate papers (order by id, batches of 500), derive greatzh hints via exported `SECTION_DOMAIN` + `rawMetadata.section`, `classifyDomain`, update only rows where computed ≠ stored. Respond `{ success, data: { scanned, updated } }`. Idempotent.
- Ongoing correctness needs no re-runs: greatzh full-sweeps weekly and upsert refreshes domain.

### 11. E2E
- **Create `app/tests/e2e/domain-tabs.spec.ts`** (URL-assertion pattern from `filters.spec.ts`): default tab active + no `domain` param; click Deepfakes → `/?domain=deepfake` + aria-current moves + count line updates; `/?tag=localization` preserved across switch; direct load `/?domain=deepfake` works; `/saved` has no tabs. Extend `a11y.spec.ts` to sweep `/?domain=deepfake`.

## Ordering
0 → 1 → {2, 5} → 3 → 4 → 6 → 7 → 8 → 9 → 10 → 11.

## Verification
```bash
cd /Users/tusharpatel/Drive_E/ForensicFeed/app
node bin/apply-migration.mjs 0005_add_paper_domain.sql   # DB first
pnpm typecheck && pnpm test:ci && pnpm lint && pnpm build
pnpm e2e
# after deploy:
curl -X POST "$APP_URL/api/admin/backfill-domain" -H "x-ingest-secret: $SECRET"
curl -X POST "$APP_URL/api/ingest/greatzh" -H "x-ingest-secret: $SECRET"
curl -X POST "$APP_URL/api/ingest/arxiv"  -H "x-ingest-secret: $SECRET"
node bin/inspect-db.mjs   # spot-check domain distribution
```
Manual QA: `/` defaults to forgery; `/?domain=deepfake` shows only deepfakes; clear-all keeps the tab; search/filters preserve the tab; `/saved` shows both domains; next Monday digest has no deepfake papers.

## Note
The uncommitted greatzh feature (adapter, migration 0004, badge, digest changes) is a prerequisite on this branch — this work builds directly on those files. Consider committing greatzh first, then this as a separate commit/PR.
