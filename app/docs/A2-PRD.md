# A2 — Hugging Face Papers + Semantic Scholar adapters; unified dedup

**Status:** In progress
**Date:** 2026-04-25
**Owner:** tusharpatel
**Builds on:** A1 (arXiv adapter, relevance scoring, feed)

## Scope change vs. original A2 (recorded 2026-04-25)

The original Plan.md called for a **Papers With Code (PwC)** adapter. During implementation
we discovered `paperswithcode.com/api/v1/` redirects to `huggingface.co/papers/trending` —
PwC has been migrated to Hugging Face Papers. The HF replacement API exposes paper metadata
(title, authors, AI-generated summary, upvotes, discussion count) but **no `code_url`**.

To preserve the "code link" deliverable without inventing a new external dependency, we:

1. Replace **PwC** with a **Hugging Face Papers** adapter (curation/popularity signal).
2. Add an inline **arXiv abstract code-URL extractor** — many forgery papers literally
   embed `Code: https://github.com/...` in the abstract. Deterministic, free, ~60–70%
   recall against papers with code.
3. Keep **Semantic Scholar** for citation counts as originally planned.

This gives both intended signals (code link + citation count) with two new adapters and
one tiny utility, instead of three external integrations. GitHub-search adapter is deferred
indefinitely.

## Goal

Two new sources flow into the same feed alongside arXiv. The same paper is never duplicated. Papers gain a code link when one exists (Papers With Code) and a citation count when available (Semantic Scholar). The feed visibly reflects both new signals.

**Success shape:** A seed run from each source against real APIs deposits papers in Supabase. The feed shows at least one paper with a "code" link and at least one with a citation chip. Re-running the same seed does not produce duplicates — it enriches existing rows.

## Scope

### In scope

- `huggingface` adapter: search the HF Papers API for image-forgery-related papers, normalise to `NormalisedPaper`. Uses the `paper.id` field (an arXiv ID) for identification. No `codeUrl` from this source — but HF's `summary` is often more readable than arXiv's raw abstract; populate `abstract` on conflict only when the existing row has none.
- `extractCodeUrl(text)` utility: regex GitHub URLs out of titles/abstracts. Wired into both arXiv and HF adapters so any paper that mentions its repo in the abstract gets `codeUrl` populated for free.
- `semantic_scholar` adapter: keyword search the Semantic Scholar Graph API, fetch `citationCount`, normalise to `NormalisedPaper`. Use `SEMANTIC_SCHOLAR_API_KEY` if present (header `x-api-key`), gracefully degrade if absent.
- Lock in priority dedup behavior with a dedicated unit test (`tests/unit/dedup.test.ts`). Implementation already lives in `findExistingPaper` (papers.ts) but is currently only tested transitively.
- Unit tests for both adapters using static fixtures.
- Inngest jobs: daily cron for each source + per-source manual-trigger events (`ingest/huggingface.manual`, `ingest/semantic-scholar.manual`). Mirrors the arXiv pattern.
- API routes `POST /api/ingest/huggingface` and `POST /api/ingest/semantic-scholar` to dispatch the manual events from a shell.
- `PaperCard` enrichment: "code" link badge (when `codeUrl` present) and citation chip (when `citationCount > 0`).
- Integration test (mocked DB) verifying same paper from all three sources collapses to one row and merges signals.

### Out of scope (later phases)

- CVF / OpenReview adapters → A3.
- Backfill citation refresh job for arXiv-only papers → A3 follow-up or B-phase.
- Filter sidebar with "has code" / citation-range filters → A4.
- Author tracking → B4.

## Existing state (post-A1)

| Piece | File | Status |
|---|---|---|
| `findExistingPaper` priority dedup | `src/lib/db/queries/papers.ts:10` | ✅ Done; no dedicated test |
| `dedupKeyFor` / `titleHash` | `src/lib/ingestion/dedup.ts` | ✅ Done; no test |
| `runAdapter` orchestrator | `src/lib/ingestion/run.ts` | ✅ Source-agnostic; works as-is |
| `Adapter` interface | `src/lib/ingestion/types.ts` | ✅ `apiKey?: string \| null` already on `AdapterFetchOptions` |
| Schema fields `codeUrl`, `citationCount` | `src/lib/db/schema.ts:64` | ✅ Already present |
| `upsertPaper` "enrich, never null out" | `src/lib/db/queries/papers.ts:65` | ✅ Already correct for merging |
| `paper_source` enum | `src/lib/db/schema.ts:22` | ✅ `paperswithcode`, `semantic_scholar` already enumerated |
| `INGESTION_*` env vars | `src/lib/env.ts` | ⚠️ Add `INGESTION_PWC_MAX_RESULTS`, reuse `SEMANTIC_SCHOLAR_API_KEY` |
| Inngest registration | `src/app/api/inngest/route.ts` | ⚠️ Append new functions |

## Deliverables

| # | File | Purpose |
|---|---|---|
| 1 | `tests/unit/dedup.test.ts` (new) | Lock arxivId > doi > titleHash priority; titleHash determinism; normaliseTitle behavior. |
| 2a | `src/lib/ingestion/code-url.ts` (new) | `extractCodeUrl(text)` GitHub URL regex utility. |
| 2b | `tests/unit/code-url.test.ts` (new) | Unit tests: GitHub variants, ignored host noise, plain-text vs URL contexts. |
| 2c | `tests/fixtures/huggingface-papers.json` (new) | Trimmed HF API response (real, captured 2026-04-25). |
| 3 | `tests/unit/huggingface-adapter.test.ts` (new) | Parse + normalise; `since` filter; codeUrl extraction wired through. |
| 4 | `src/lib/ingestion/adapters/huggingface.ts` (new) | HF Papers adapter. |
| 4b | `src/lib/ingestion/adapters/arxiv.ts` (modified) | Wire `extractCodeUrl` on every parsed entry. |
| 5 | `tests/fixtures/semantic-scholar.json` (new) | Captured S2 search response. |
| 6 | `tests/unit/semantic-scholar-adapter.test.ts` (new) | Parse + normalise; pagination cursor; api-key header pass-through; missing-citations fallback. |
| 7 | `src/lib/ingestion/adapters/semantic-scholar.ts` (new) | Adapter implementation. |
| 8 | `src/lib/inngest/ingest-huggingface.ts` (new) | Daily cron + manual-trigger Inngest functions for HF. |
| 9 | `src/lib/inngest/ingest-semantic-scholar.ts` (new) | Daily cron + manual-trigger Inngest functions for S2. |
| 10 | `src/app/api/inngest/route.ts` (modified) | Register new Inngest functions. |
| 11 | `src/app/api/ingest/huggingface/route.ts` (new) | `POST` → emits `ingest/huggingface.manual` Inngest event. |
| 12 | `src/app/api/ingest/semantic-scholar/route.ts` (new) | `POST` → emits `ingest/semantic-scholar.manual` Inngest event. |
| 12b | `src/lib/db/schema.ts` (modified) | Add `'huggingface'` to `paperSource` enum. |
| 12c | `drizzle/0002_add_huggingface_source.sql` (new) | `ALTER TYPE paper_source ADD VALUE 'huggingface'`. |
| 13 | `src/components/feed/PaperCard.tsx` (modified) | "code" link badge + citation chip. |
| 14 | `src/components/feed/feed.css` (modified) | Styles for new badges, token-driven. |
| 15 | `tests/unit/multi-source-dedup.test.ts` (new) | Integration test (mocked DB): three sources → one row, signals merged. |

## Contracts

### Hugging Face Papers adapter

- **Endpoint:** `https://huggingface.co/api/papers/search?q=<query>` (no auth, no documented rate limit).
- **Strategy:** one query per forgery keyword group from `FORGERY_TERMS`; the HF response is a flat array (typically ≤120 items). Merge across keyword queries; dedupe by `paper.id` (arXiv ID) within batch.
- **Mapping:**
  - `paper.id` → `arxivId` (HF Papers IDs are arXiv IDs)
  - `paper.title` → `title`
  - `paper.authors[].name` → `authors`
  - `paper.summary` → `abstract`
  - `paper.publishedAt` → `publishedDate`
  - `extractCodeUrl(summary)` → `codeUrl`
  - `primarySource = 'huggingface'`
  - `rawMetadata.upvotes`, `rawMetadata.numComments`, `rawMetadata.aiKeywords` → preserved for future relevance/curation use
- **Rate limit:** unknown; cap to 1 req/sec across the keyword sweep.

### arXiv adapter enrichment (additive)

`parseArxivAtom` already populates everything except `codeUrl`. Wire `extractCodeUrl(abstract)` into the parse step so any arXiv paper that embeds a repo URL in its abstract gets `codeUrl` set at insert time. No new fetch, no extra latency.

### Semantic Scholar adapter

- **Endpoint:** `https://api.semanticscholar.org/graph/v1/paper/search?query=<q>&fields=title,abstract,authors,externalIds,year,publicationDate,openAccessPdf,citationCount&limit=100`
- **Auth:** if `SEMANTIC_SCHOLAR_API_KEY` is set, send `x-api-key`. Otherwise unauthenticated (lower rate limit).
- **Strategy:** one query per primary keyword group (e.g. `image forgery detection`, `image manipulation localization`, `deepfake detection`); merge in adapter; filter by `publicationDate >= since`.
- **Mapping:**
  - `externalIds.ArXiv` → `arxivId`
  - `externalIds.DOI` → `doi`
  - `openAccessPdf.url` → `pdfUrl`
  - `citationCount` → `citationCount`
  - `primarySource = 'semantic_scholar'`
- **Rate limit:** 1 req/sec without key; 100 req/sec with key. Fetch is keyword-batched to keep below either ceiling.

### `POST /api/ingest/{source}` contract

```
POST /api/ingest/paperswithcode      // or /api/ingest/semantic-scholar
Content-Type: application/json

{ "seed": true }    // optional — triggers 6-month backfill
```

- Zod validation; generic 400 message on invalid body (no schema leakage — see A1 fix #6).
- Response: `{ success: true, data: { eventId: string } }`.
- Each route mirrors `/api/ingest/arxiv` exactly.

### `PaperCard` rendering rules

- "code" badge: anchor element with `target="_blank" rel="noopener noreferrer"` linking to `codeUrl`. Visible label "code"; sr-only suffix "(opens in new tab)".
- Citation chip: text-only chip "{n} citations" (singular "1 citation"). Hidden when `citationCount` is null or 0.
- Both styled via `--color-tag-bg` / `--color-tag-text` (already meeting AA contrast — see A1 a11y pass).

## Done when

- [ ] PwC adapter unit tests pass against fixture (parse, normalise, since filter).
- [ ] S2 adapter unit tests pass against fixture (parse, normalise, key passed in header, since filter).
- [ ] Dedup priority test passes; covers arxivId-wins-over-doi and doi-wins-over-titleHash branches.
- [ ] `POST /api/ingest/papers` triggers an Inngest run that completes against real APIs; status `success` or `partial`.
- [ ] After running all three sources against the same arXiv paper, the DB has exactly one row whose `codeUrl` is set (from PwC) and `citationCount` is set (from S2).
- [ ] Feed renders at least one "code" badge and at least one citation chip from real data.
- [ ] Multi-source dedup integration test (mocked) green.
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm vitest run` all clean.
- [ ] `code-reviewer` + `typescript-reviewer` + `security-reviewer` pass; no CRITICAL/HIGH open.
- [ ] No file > 400 lines (typical), 800 hard max; no function > 50 lines.

## Non-goals / explicit deferrals

- Citation refresh job (weekly re-fetch of `citationCount` for existing papers) → A3 or B-phase.
- Best-effort PwC code-url enrichment beyond first page → cap at 4 concurrent and accept misses.
- Author tracking → B4.
- HTML rendering of code-language tags / repo metadata → out of scope; only the URL is needed.

## Risk notes

- **PwC API stability:** the public REST API is undocumented; field names can shift. Adapter must defensively coerce missing fields and short-circuit on shape mismatch with a logged `partial` status, not a thrown crash.
- **S2 rate limit without API key:** at 1 req/sec, full keyword sweep takes ~10s; acceptable for a daily cron. Document the trade-off in `.env.example`.
- **Title-hash collisions across versions:** PwC sometimes lists workshop variants of the same paper with mildly different titles; the title-hash will differ. Acceptable — workshop and main-conference versions may legitimately be separate rows. Revisit if this causes visible noise in A4.
- **PaperCard footer overflow:** adding two more chips at 390px could wrap. Verified visually in A1's mobile screenshot — `flex-wrap: wrap` handles it. Re-verify after this change.
