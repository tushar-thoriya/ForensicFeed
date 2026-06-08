---
name: paper-tracker-ingestion
description: Patterns for writing source adapters (arXiv, Papers With Code, Semantic Scholar, CVF, OpenReview) and wiring them into the Inngest ingestion pipeline for the image forgery paper tracker.
---

# Paper Tracker — Ingestion Patterns

Scope: the ingestion layer of `app/` (research paper tracker for image forgery detection). All five source adapters share one contract. One adapter failure must never stop the others.

Source of truth: `CLAUDE.md §4`, `Ideas V4.md §10`.

---

## Adapter contract

Every adapter implements the same interface:

```ts
// src/lib/ingestion/types.ts
export interface AdapterFetchOptions {
  since: Date
  now: Date
  apiKey?: string | null
  maxResults?: number
}

export interface Adapter {
  source: PaperSource
  fetch(options: AdapterFetchOptions): Promise<NormalisedPaper[]>
}
```

Rules for every adapter:

1. **Pure**: given the same options, return the same papers (ignoring upstream changes). No hidden state.
2. **`since`-aware**: filter out papers published before `options.since`.
3. **`maxResults` respected**: cap pagination.
4. **No DB writes**: adapters return `NormalisedPaper[]`. The orchestrator (`run.ts`) handles dedup + insert.
5. **Throw on transport failure**: network errors, 5xx, malformed payloads throw. The orchestrator catches per-source and records a `partial` or `failed` run — other adapters keep going.
6. **No console.log**: adapter logging flows through the run orchestrator so it ends up in `ingest_runs`.

---

## Per-source notes

### arXiv

- Endpoint: `http://export.arxiv.org/api/query`
- Query: `search_query=cat:cs.CV+OR+cat:cs.CR` plus keyword OR-clauses from `Ideas V4.md §12`.
- Sort: `sortBy=submittedDate&sortOrder=descending`.
- Pagination: `start` + `max_results` (cap 2000).
- Parse: Atom XML via a small DOM walk (`parseArxivAtom`) — avoid adding a dependency.
- Dedup key: `arxivId` (strip version suffix `v1`, `v2` …).
- Rate limit: be polite — max 1 req/3s.

### Papers With Code

- Endpoint: `https://paperswithcode.com/api/v1/`
- Strategy: query the "image-forgery-detection" task area and supplement with keyword searches.
- Useful fields: `code_url`, `methods`, `datasets`, linked `arxiv_id`.
- Dedup key: `arxivId` when present, else title hash.

### Semantic Scholar

- Endpoint: `https://api.semanticscholar.org/graph/v1/paper/search`
- Auth: optional `x-api-key` header from `SEMANTIC_SCHOLAR_API_KEY` (higher rate limits).
- Query strategy: keyword search daily; separate weekly job to refresh citation counts on already-stored papers.
- Useful fields: `citationCount`, `externalIds.DOI`, `externalIds.ArXiv`.
- Dedup key: `arxivId` → `doi` → S2 paper ID (fallback).

### CVF (CVPR / ICCV / WACV)

- Source: proceedings index pages at `https://openaccess.thecvf.com/`.
- Method: scrape with `cheerio`; filter by keyword in title before fetching detail pages.
- Cadence: weekly.
- Respect `robots.txt` — fetch it once per run and skip paths it disallows.
- Dedup key: title hash.

### OpenReview (ICLR / NeurIPS)

- Endpoint: `https://api.openreview.net/notes`.
- Query by `invitation` for the venue's submissions.
- Useful fields: title, abstract, authors, PDF URL, decision.
- Dedup key: OpenReview paper ID → fallback to title hash.

---

## Deduplication strategy

Implemented in `src/lib/ingestion/dedup.ts`. Precedence:

1. `arxivId` present → dedup by `arxivId`.
2. else `doi` present → dedup by `doi`.
3. else `titleHash = sha256(normalize(title))` — lowercase + collapse whitespace + strip punctuation.

On conflict with an existing row:

- Merge upward: update `citationCount`, `codeUrl`, `updatedDate`, `rawMetadata` (shallow merge).
- Never overwrite `publishedDate` or `primarySource`.
- Re-compute `relevanceScore` + `relevanceTags` if the scorer version has changed (see `paper-tracker-relevance` skill).

---

## Relevance at ingest time

Every adapter's output is passed through `scoreRelevance` and `assignTags` (from `src/lib/ingestion/tagger.ts`) before write. Store the score and tags on the row. Papers below the 0.2 threshold are still stored — default feed queries filter them out, but they remain available for debugging and future re-scoring.

See the `paper-tracker-relevance` skill for scoring rules.

---

## Orchestration (Inngest)

| Job                         | Schedule (UTC)           | Adapters                           |
| --------------------------- | ------------------------ | ---------------------------------- |
| `ingest/arxiv.daily`        | `0 6 * * *`              | arXiv                              |
| `ingest/pwc-s2.daily`       | `0 7 * * *`              | Papers With Code, Semantic Scholar |
| `ingest/conferences.weekly` | `0 8 * * 1` (Mondays)    | CVF, OpenReview                    |
| `ingest/citations.weekly`   | `0 9 * * 3` (Wednesdays) | Semantic Scholar refresh           |

Each scheduled job opens an `ingest_runs` row per source:

```
started_at     → now
status         → 'running'
papers_fetched → (updated at end)
papers_inserted → (updated at end)
papers_updated → (updated at end)
status         → 'success' | 'partial' | 'failed'
error_message  → stringified error on failure
```

**Error isolation**: wrap each adapter call in its own `try/catch`. One failure sets that source's run to `failed` and continues to the next adapter.

---

## Seed ingest (first run)

- Controlled by env var `INGESTION_SEED_MONTHS` (default 6).
- First run seeds by passing `since = now - SEED_MONTHS`.
- Subsequent runs pass `since = last successful run's started_at - 1 day` (overlap buffer).
- Seed mode should page aggressively (max results cap ~2000 per adapter) but still honour politeness delays.

---

## Testing patterns

- Every adapter ships with a fixture in `tests/fixtures/` (e.g. `arxiv-feed.xml`). Tests load the fixture, mock `fetch`, and assert the parser's output.
- Keep network behaviour out of unit tests — mock `globalThis.fetch`.
- Each adapter has at least: happy path, `since` cutoff, empty response, error status (4xx/5xx).
- Cross-adapter integration test runs all adapters against fixtures → dedup → asserts no duplicates.

---

## Checklist before adding a new adapter

- [ ] Implements `Adapter` interface.
- [ ] Throws on transport errors.
- [ ] Respects `since` and `maxResults`.
- [ ] Has a `tests/fixtures/<source>.*` file.
- [ ] Unit tests: happy, filter, empty, error.
- [ ] Wired into the orchestrator with its own `try/catch`.
- [ ] Dedup key documented in this file.
- [ ] Schedule added to the Inngest table above.
- [ ] `primarySource` value added to the `paper_source` pg enum if new.
