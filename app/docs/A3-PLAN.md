# A3 — Implementation plan

**Date:** 2026-05-09
**PRD:** `app/docs/A3-PRD.md`
**Approach:** TDD — fixture → failing tests → minimal implementation → green.

## Build order

Each phase ends with `pnpm vitest run` green before moving on.

### Phase 1 — CVF adapter (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 1.1 | Capture trimmed CVPR 2025 proceedings HTML fixture | `tests/fixtures/cvf-proceedings.html` | Fixture has ≥6 entries: 2 forgery-relevant, 4 unrelated noise |
| 1.2 | Write CVF adapter unit tests (RED) | `tests/unit/cvf-adapter.test.ts` | Tests fail because adapter doesn't exist |
| 1.3 | Implement CVF adapter (GREEN) | `src/lib/ingestion/adapters/cvf.ts` | All CVF tests pass; `pnpm typecheck` clean |

**Test cases** (1.2):
- Parses fixture into `NormalisedPaper[]`
- Filters by forgery keywords in title (case-insensitive)
- Skips unrelated entries
- Extracts arXiv ID from supplementary link when present
- Resolves relative `Pdf` href to absolute URL
- Sanitises external URLs via `sanitiseExternalUrl`
- Per-venue partial failure: 2/4 venues fail, returns papers from 2 successful
- All-venues fail: re-throws `lastError`
- Honors `since` filter (drops papers with `publishedDate < since`)

### Phase 2 — OpenReview adapter (TDD)

| Step | Task | File | Gate |
|---|---|---|---|
| 2.1 | Capture OpenReview API v2 search response fixture | `tests/fixtures/openreview-notes.json` | Real captured response, ≤30 KB |
| 2.2 | Write OR adapter unit tests (RED) | `tests/unit/openreview-adapter.test.ts` | Tests fail; adapter doesn't exist |
| 2.3 | Implement OR adapter (GREEN) | `src/lib/ingestion/adapters/openreview.ts` | All OR tests pass; typecheck clean |

**Test cases** (2.2):
- Parses fixture `note.content.{title,authors,abstract,pdf}.value` correctly
- Filters by forgery keywords
- Pagination cursor advances; stops at hard cap (5 pages)
- ICLR vs NeurIPS routing: passes `group` filter to API
- Missing-abstract: falls back to empty string, doesn't crash
- `extractCodeUrl(abstract)` populates `codeUrl`
- `cdate` (ms epoch) → `publishedDate`
- Per-keyword partial failure: 2/4 keywords fail, papers from successful 2 are returned

### Phase 3 — Inngest wiring + API routes

| Step | Task | File | Gate |
|---|---|---|---|
| 3.1 | Create `ingest-cvf.ts` (weekly cron + manual handler) | `src/lib/inngest/ingest-cvf.ts` | Mirrors HF pattern; uses factory utilities |
| 3.2 | Create `ingest-openreview.ts` | `src/lib/inngest/ingest-openreview.ts` | Same pattern |
| 3.3 | Register both in Inngest route | `src/app/api/inngest/route.ts` (modify) | New functions show in `/api/inngest` |
| 3.4 | Create `POST /api/ingest/cvf` route | `src/app/api/ingest/cvf/route.ts` | Uses `createManualIngestHandler('ingest/cvf.manual')` |
| 3.5 | Create `POST /api/ingest/openreview` route | `src/app/api/ingest/openreview/route.ts` | Same factory call |

### Phase 4 — UI: venue_type pill

| Step | Task | File | Gate |
|---|---|---|---|
| 4.1 | Add label map + `<span className="tag-badge tag-badge-venue">` | `src/components/feed/PaperCard.tsx` | Pill renders for every card |
| 4.2 | Add `.tag-badge-venue` style | `src/components/feed/feed.css` | Token-driven; AA contrast preserved |
| 4.3 | Verify mobile (390px) — chips wrap cleanly | Visual check via Playwright snapshot | No horizontal overflow |

### Phase 5 — Integration test + env

| Step | Task | File | Gate |
|---|---|---|---|
| 5.1 | Extend multi-source dedup test with 4th source merging into arXiv row | `tests/unit/multi-source-dedup.test.ts` (modify) | New case green; existing cases stay green |
| 5.2 | Add `INGESTION_CVF_VENUES`, `INGESTION_OPENREVIEW_VENUES` Zod parsing | `src/lib/env.ts` (modify) | Defaults applied when unset |
| 5.3 | Document new env vars | `.env.example` (modify) | Examples clear and copy-pasteable |

### Phase 6 — Quality gates

| Step | Task | Gate |
|---|---|---|
| 6.1 | `pnpm typecheck` | Clean |
| 6.2 | `pnpm lint` | Clean |
| 6.3 | `pnpm vitest run` | All tests green (84 + new ones) |
| 6.4 | `pnpm build` | Production build succeeds |
| 6.5 | Parallel reviewer sweep | `code-reviewer` + `typescript-reviewer` + `security-reviewer` — no CRITICAL/HIGH |

### Phase 7 — Commit + checkpoint

| Step | Task |
|---|---|
| 7.1 | Conventional commit: `feat(ingestion): add CVF + OpenReview adapters; venue_type badge` |
| 7.2 | Push to `origin/main` |
| 7.3 | Update memory with A3 progress; archive A2 |

## File estimate

| File | Type | Est. lines |
|---|---|---|
| `cvf.ts` | new | ~220 |
| `openreview.ts` | new | ~200 |
| `cvf-adapter.test.ts` | new | ~180 |
| `openreview-adapter.test.ts` | new | ~180 |
| `cvf-proceedings.html` (fixture) | new | ~80 |
| `openreview-notes.json` (fixture) | new | ~250 |
| `ingest-cvf.ts` | new | ~50 |
| `ingest-openreview.ts` | new | ~50 |
| `cvf/route.ts` | new | ~10 |
| `openreview/route.ts` | new | ~10 |
| `PaperCard.tsx` | modify | +20 lines |
| `feed.css` | modify | +30 lines |
| `multi-source-dedup.test.ts` | modify | +50 lines |
| `env.ts` | modify | +12 lines |
| `.env.example` | modify | +8 lines |
| `inngest/route.ts` | modify | +4 lines |

**No file approaches the 800-line cap.** All adapter files target ≤250 lines.

## Risk gates

- **Cheerio fixture drift:** lock fixture to a known snapshot; do not run scraper against live site during tests.
- **OR API v2 response shape:** capture fixture with `curl` once, treat as canonical. If real-API response shape changes, the fixture-based unit tests catch it during smoke.
- **Time estimate:** ~6–8 hours of focused dev across all phases. Phase 1 + 2 (TDD adapters) are the bulk; Phase 3–7 are mechanical.
