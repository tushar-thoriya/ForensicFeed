# A3 — CVF + OpenReview adapters; venue-type badge

**Status:** In progress
**Date:** 2026-05-09
**Owner:** tusharpatel
**Builds on:** A2 (HF Papers + Semantic Scholar adapters, code-URL extractor, multi-source dedup)

## Goal

Two new conference sources flow into the same feed alongside arXiv, Hugging Face Papers, and Semantic Scholar. Conference papers (CVPR, ICCV, WACV, ICLR, NeurIPS) are visible in the feed with a clear venue indicator, deduplicated against pre-existing arXiv preprints of the same paper.

**Success shape:** A weekly cron pulls the latest CVPR proceedings and ICLR/NeurIPS submissions filtered by forgery keywords. Re-running against an already-ingested arXiv paper enriches the existing row with `venue` (e.g. `"CVPR 2025"`), `venueType` (`"conference"`), and a confirmed `pdfUrl` from the proceedings — no duplicate row.

## Scope

### In scope

- **`cvf` adapter** — scrape `https://openaccess.thecvf.com/<VENUE><YEAR>?day=all` for CVPR, ICCV, WACV proceedings. Filter by forgery keywords in title. Extract title, authors, PDF link, supplementary link (if present), arXiv ID (when listed in supplementary). Use cheerio.
- **`openreview` adapter** — query OpenReview API v2 (`https://api2.openreview.net/notes/search`) for ICLR + NeurIPS submissions. Filter by forgery keywords. Extract title, authors, abstract, PDF link, OpenReview forum URL.
- **Title-hash dedup** — both adapters mostly produce papers without arXiv IDs. Title-hash dedup branch (already implemented and tested in A2) is the load-bearing path. Add a focused integration test for CVF/OR → arXiv collision (same paper, conference version arrives second, enriches arXiv row).
- **Weekly Inngest jobs** — `ingest-cvf` and `ingest-openreview` cron-scheduled weekly (Monday 07:00 UTC for CVF, 07:30 UTC for OpenReview to stagger). Manual-trigger events mirror the A2 factory pattern.
- **API routes** — `POST /api/ingest/cvf` and `POST /api/ingest/openreview` using the existing `createManualIngestHandler` factory (no copy-paste).
- **`venue_type` badge** — add a small pill on `PaperCard` next to existing chips: `arXiv`, `Conference`, `Workshop`, `Preprint`. Driven by the `venueType` field already in the schema.
- **Unit tests** — adapters parse fixtures correctly; keyword filter works; partial-failure isolation; OR pagination cursor.
- **Integration test** — three-source dedup test from A2 extended with a fourth source (CVF or OR) merging into the same paper.

### A2 deferred items pulled into A3

- **HF adapter venue inference** — currently hardcodes `venue: 'arXiv'` and `venueType: 'arxiv'`. HF Papers always carry an arXiv ID, so the hardcode is technically correct but should at least be explicit; revisit only if needed for accuracy when the same paper has both arXiv and conference versions.
- **Real-API smoke for HF + S2** — folded into the manual end-of-A3 verification step rather than a blocking gate, since A4 will exercise these adapters again under filter sidebar work.

### Out of scope (later phases)

- ECCV (uses ECVA, separate scrape contract) → revisit in A4 or B-phase.
- BMVC → defer; lower volume, lower priority.
- Citation refresh job for existing papers → B-phase.
- `venue_type` filter dimension in the sidebar → A4 (filter sidebar phase).
- Author tracking → B4.

## Existing state (post-A2)

| Piece | File | Status |
|---|---|---|
| `paper_source` enum has `'cvf'`, `'openreview'` | `src/lib/db/schema.ts:22` | ✅ Already enumerated; no migration needed |
| `venue_type` enum has `'conference'`, `'workshop'` | `src/lib/db/schema.ts:14` | ✅ Already enumerated |
| `PaperSource` / `VenueType` TS types | `src/types/paper.ts` | ✅ Match enum |
| `findExistingPaper` priority dedup | `src/lib/db/queries/papers.ts:10` | ✅ Hash branch covered by tests |
| `runAdapter` orchestrator | `src/lib/ingestion/run.ts` | ✅ Source-agnostic |
| `Adapter` interface | `src/lib/ingestion/types.ts` | ✅ Reusable as-is |
| `createManualIngestHandler` factory | `src/lib/inngest/manual-trigger.ts` | ✅ Use for new routes |
| `parseIngestEvent` Zod validator | `src/lib/inngest/utils.ts` | ✅ Reusable |
| `extractCodeUrl` utility | `src/lib/ingestion/code-url.ts` | ✅ Apply to OR abstracts too |
| `sanitiseExternalUrl` allow-list | `src/lib/security/url.ts` | ✅ Apply to all CVF/OR external URLs |
| `INGEST_TRIGGER_SECRET` constant-time check | factory | ✅ Inherited by new routes |

## Deliverables

| # | File | Purpose |
|---|---|---|
| 1 | `tests/fixtures/cvf-proceedings.html` (new) | Trimmed CVPR 2025 proceedings page snippet with ~6 entries — 2 forgery-relevant, 4 unrelated. |
| 2 | `tests/unit/cvf-adapter.test.ts` (new) | Parse + normalise; keyword filter; missing arxivId path; supplementary-pdf preference; partial-failure path. |
| 3 | `src/lib/ingestion/adapters/cvf.ts` (new) | CVF adapter implementation. ≤ 250 lines target. |
| 4 | `tests/fixtures/openreview-notes.json` (new) | Captured OpenReview API v2 search response. |
| 5 | `tests/unit/openreview-adapter.test.ts` (new) | Parse + normalise; keyword filter; pagination cursor; ICLR vs NeurIPS routing; missing-abstract fallback. |
| 6 | `src/lib/ingestion/adapters/openreview.ts` (new) | OpenReview adapter implementation. ≤ 250 lines target. |
| 7 | `src/lib/inngest/ingest-cvf.ts` (new) | Weekly cron `0 7 * * 1` + manual-trigger event handler. |
| 8 | `src/lib/inngest/ingest-openreview.ts` (new) | Weekly cron `30 7 * * 1` + manual-trigger event handler. |
| 9 | `src/app/api/inngest/route.ts` (modified) | Register `cvfFunctions` + `openreviewFunctions`. |
| 10 | `src/app/api/ingest/cvf/route.ts` (new) | `POST` → emits `ingest/cvf.manual`. Uses factory. |
| 11 | `src/app/api/ingest/openreview/route.ts` (new) | `POST` → emits `ingest/openreview.manual`. Uses factory. |
| 12 | `src/components/feed/PaperCard.tsx` (modified) | `venue_type` pill: `arXiv` / `Conference` / `Workshop` / `Preprint`. |
| 13 | `src/components/feed/feed.css` (modified) | New `.tag-badge-venue` class, token-driven, AA contrast. |
| 14 | `tests/unit/multi-source-dedup.test.ts` (modified) | Add a fourth-source merge case (CVF or OR enriching arXiv row). |
| 15 | `.env.example` (modified) | Document `INGESTION_CVF_VENUES` (default `CVPR2025,CVPR2024,ICCV2025,WACV2025`) and `INGESTION_OPENREVIEW_VENUES` (default `ICLR.cc/2025/Conference,NeurIPS.cc/2024/Conference`). |
| 16 | `src/lib/env.ts` (modified) | Zod-parse the two new optional env vars; sensible defaults. |

## Contracts

### CVF adapter

- **Endpoints (per venue):**
  - `https://openaccess.thecvf.com/CVPR2025?day=all` — main proceedings.
  - `https://openaccess.thecvf.com/CVPR2025_workshops` — workshops index (parse links, skip for now in A3).
  - Same shape for `ICCV2025`, `WACV2025`.
- **Strategy:** one HTTP fetch per configured venue (default 4 venues). Parse `<dt class="ptitle">` blocks with cheerio; each block contains the title (`<a>`), author list (`<dd>`), and links (`Pdf`, `Supp`, `arXiv`). Filter by case-insensitive forgery keyword match on title. Extract arXiv ID from supplementary link if present (`?arXiv:2403.12345`-style). Return `NormalisedPaper[]`.
- **Mapping:**
  - Title text → `title`
  - `<dd>` author text split on `,` → `authors`
  - `Pdf` href → `pdfUrl` (resolve relative URL → absolute, sanitise)
  - `Supp` href → `rawMetadata.supplementaryUrl`
  - arXiv link if found → `arxivId`
  - Venue label `"CVPR 2025"` from URL year suffix → `venue`
  - `venueType: 'conference'` (workshop pages are skipped in A3)
  - `publishedDate` = first day of conference year (e.g. `2025-06-01` for CVPR — coarse but good enough for sort)
  - `primarySource: 'cvf'`
  - `extractCodeUrl` applied to title + author list (low yield but free)
- **Failure isolation:** per-venue try/catch; if 2 of 4 venues fail, return papers from the 2 successful ones with `lastError` re-thrown only when **all** fail. Mirrors HF adapter pattern.
- **Rate limit:** unknown; cap to 1 req/sec across the venue sweep. CVF is a static site, but be polite.
- **`robots.txt`:** check before fetch; bail with logged message if disallowed (per CLAUDE.md §16 ingestion guardrails). One-line check using `ky.get('https://openaccess.thecvf.com/robots.txt')` cached for the run.

### OpenReview adapter

- **Endpoint:** `https://api2.openreview.net/notes/search?query=<term>&content=all&type=all&source=forum&group=<venue>`
- **Auth:** none in A3. Public papers only.
- **Strategy:** for each configured venue (default ICLR/2025, NeurIPS/2024), one query per primary forgery term group from `FORGERY_TERMS`. Merge in adapter; dedupe by `note.id` within batch.
- **Mapping:**
  - `note.content.title.value` → `title`
  - `note.content.authors.value[]` → `authors`
  - `note.content.abstract.value` → `abstract`
  - `note.content.pdf.value` → `pdfUrl` (sanitise)
  - `note.cdate` (ms epoch) → `publishedDate`
  - `note.id` → `rawMetadata.openreviewId`
  - venue label from group field (e.g. `"ICLR 2025"`) → `venue`
  - `venueType: 'conference'`
  - `primarySource: 'openreview'`
  - `extractCodeUrl(abstract)` → `codeUrl`
- **Pagination:** `offset`/`limit` (max 100 per page). Cursor through up to 5 pages per venue per keyword group, then stop (hard cap to bound runtime).
- **Rate limit:** OpenReview's public API has no formally documented limit but is generally lenient; cap to 2 req/sec across the sweep.

### `POST /api/ingest/{cvf,openreview}` contract

```
POST /api/ingest/cvf            // or /api/ingest/openreview
Content-Type: application/json
x-ingest-secret: <INGEST_TRIGGER_SECRET>   // when configured

{ "seed": true }                // optional
```

- Uses `createManualIngestHandler('ingest/cvf.manual')` / `('ingest/openreview.manual')`.
- Zod-validated payload; constant-time secret check.
- Response: `{ success: true, data: { eventId: string } }`.

### `PaperCard` `venue_type` pill rules

- Small text-only pill, sibling to existing `.tag-badge` chips.
- Label map: `arxiv → "arXiv"`, `conference → "Conference"`, `workshop → "Workshop"`, `preprint → "Preprint"`, `journal → "Journal"`.
- Style: same `--color-tag-bg` / `--color-tag-text` token pair to keep contrast and visual rhythm consistent with existing chips. New CSS class `.tag-badge-venue` for any future per-type styling toggles.
- Position: first chip in the meta row so the venue is immediately scannable.

## Done when

- [ ] CVF adapter unit tests pass against fixture (parse, normalise, keyword filter, missing arxivId, partial-failure path).
- [ ] OpenReview adapter unit tests pass against fixture (parse, normalise, pagination, keyword filter, missing-abstract fallback).
- [ ] Multi-source dedup integration test extended to four sources (arXiv + HF + S2 + CVF/OR) — one row, signals merged correctly.
- [ ] Both adapters honor per-source partial-failure isolation: one venue/group failure does not stop the others.
- [ ] `POST /api/ingest/cvf` and `POST /api/ingest/openreview` accept manual triggers behind `INGEST_TRIGGER_SECRET`.
- [ ] Inngest weekly cron registered for both functions; visible in `/api/inngest` introspection.
- [ ] `PaperCard` shows `venue_type` pill on every card; AA contrast verified.
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm vitest run` all clean.
- [ ] `code-reviewer` + `typescript-reviewer` + `security-reviewer` pass; no CRITICAL/HIGH open.
- [ ] No file > 400 lines (typical), 800 hard max; no function > 50 lines.
- [ ] `app/.env.example` documents new env vars; `src/lib/env.ts` validates them.

## Non-goals / explicit deferrals

- **ECCV adapter** — uses ECVA (different proceedings host); separate contract; defer.
- **BMVC adapter** — lower priority; defer.
- **CVF workshop scrape** — workshops index page parsed for completeness but not crawled in A3 (would multiply venue count by ~30). Defer to A4 once filter sidebar can hide workshops by default.
- **Citation refresh on conference papers** — S2 lookup post-merge is appealing but doubles API surface; defer to B-phase.
- **Filter UI for `venue_type`** — the field is now visibly displayed but not yet filterable; that ships in A4.
- **Real-API smoke as a blocking gate** — exercise these adapters during normal A4 work; not a release gate for A3 close.

## Risk notes

- **CVF HTML stability** — proceedings page markup hasn't changed in years but isn't a contract. Adapter must defensively coerce missing fields and short-circuit on shape mismatch with a logged `partial` status, not a thrown crash. The fixture and snapshot test catch unrelated drift early.
- **OpenReview API v1 vs v2** — v1 (`https://api.openreview.net`) is being phased out; v2 (`https://api2.openreview.net`) is the target. Lock to v2 base URL via constant; if v2 returns 404 on a venue group, log and continue rather than fail.
- **Title-hash collisions across venues** — same paper at CVPR 2024 and CVPR 2025 (rare but possible for journal extensions) would currently collapse to one row. Acceptable for A3; document and revisit if it surfaces in A4 filter view.
- **`PaperCard` chip overflow at 390px** — adding a fourth chip (`venue` + `code` + `citations` + `tags`) risks wrap. Verify on mobile screenshot during A3-T7; `flex-wrap: wrap` already in place but visual regression test should re-snapshot.
- **`robots.txt` for CVF** — the file currently allows all crawling; adapter should re-check on every run (cached for the run) so a future tightening is honored without code change.
