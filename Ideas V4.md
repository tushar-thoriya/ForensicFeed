# Ideas V4.md — Research Paper Tracker: Image Forgery Detection & Localization

> **Version:** V4 (replaces V2 general AI aggregator concept entirely)
> **Changed from V3:** Narrowed scope from general AI news → domain-specific research paper tracker
> **Research domain:** Image forgery detection and localization, with special interest in document-photo tampering (OVD)
> **Status:** Decisions locked — all open questions answered 2026-04-19

---

## Table of Contents

1. [Problem & Goal](#1-problem--goal)
2. [Research Domain Definition](#2-research-domain-definition)
3. [Paper Sources](#3-paper-sources)
4. [What to Track Per Paper](#4-what-to-track-per-paper)
5. [Relevance Scoring & Filtering](#5-relevance-scoring--filtering)
6. [Website Features](#6-website-features)
7. [Architecture](#7-architecture)
8. [Tech Stack](#8-tech-stack)
9. [Data Schema](#9-data-schema)
10. [Ingestion Strategy](#10-ingestion-strategy)
11. [Phase Roadmap](#11-phase-roadmap)
12. [Keywords & Search Terms](#12-keywords--search-terms)
13. [Open Questions](#13-open-questions)

---

## 1. Problem & Goal

**Problem:** Research in image forgery detection moves fast. New methods, datasets, and benchmarks appear weekly across arXiv, CVPR, NeurIPS, ICCV, ECCV, and other venues. Manually checking all these sources is impossible. Most papers are about general image forgery — not specific to document photos — but those general methods are directly applicable to the OVD (Official Valid Document) problem.

**Goal:** A personal website that automatically aggregates the latest open-access research papers on image forgery detection and localization. No paywalls. No general AI news. Just relevant papers — organized, searchable, and up to date.

**Non-goals:**
- General AI news (removed from V2)
- Social media posts, GitHub repos, YouTube, podcasts
- Papers behind paywalls (IEEE Xplore full-text, ACM DL full-text) — link only if abstract is free
- PDF document forgery (out of scope — this project is about photos of documents)

---

## 2. Research Domain Definition

### Primary domain
**Image forgery detection and localization** — detecting whether an image has been tampered with, and if so, where.

### Sub-domains to track

| Sub-domain | Why relevant |
|---|---|
| Copy-move forgery detection | One of the three classic forgery types; appears in document photo tampering |
| Splicing forgery detection | Pasting a region from another image into a document photo |
| Inpainting / removal detection | Erasing text, stamps, or watermarks on document photos |
| GAN / AI-generated image detection | Documents may be entirely AI-generated |
| Deepfake detection (image-based) | Face region on ID documents can be swapped |
| Document forgery detection | Specific to government IDs, passports, licenses |
| Text region manipulation detection | Altered text on documents (dates, names, numbers) |
| Forgery localization / segmentation | Pixel-level mask prediction — directly needed for OVD |
| Passive image authentication | No watermark needed — purely from image signal |
| Image forensics / steganalysis | Broader forensic signals applicable to document photos |
| Noise-based/PRNU detection | Camera fingerprint methods useful for photo authenticity |

### What is OVD (context)
OVD = Official Valid Document — government-issued documents like passports, national ID cards, driving licenses, visas. The input is always a **photo of the document** (JPEG, PNG from phone camera or scanner) — **not a PDF**. Forgery types on OVDs: altered text, replaced photo, forged signature, removed stamps, copy-move within the document.

### Scope note
Do NOT restrict to papers that mention "document" explicitly. A general forgery detection or localization paper is still highly relevant. Cast the net wide at ingestion; use relevance scoring to surface the most applicable papers.

---

## 3. Paper Sources

### Primary sources (free, open access)

| Source | URL | Access method | Priority |
|---|---|---|---|
| arXiv | https://arxiv.org/ | API (free, no key needed) | S |
| Papers With Code | https://paperswithcode.com/ | API (free) + links to arXiv | S |
| Semantic Scholar | https://www.semanticscholar.org/ | API (free, key recommended) | A |
| NeurIPS | https://neurips.cc/ | Open proceedings | A |
| CVPR | https://cvpr.thecvf.com/ | Open via CVF | A |
| ICCV | https://iccv.thecvf.com/ | Open via CVF | A |
| ECCV | https://www.ecva.net/ | Open proceedings | A |
| WACV | https://wacv.thecvf.com/ | Open via CVF | B |
| ICLR | https://iclr.cc/ | OpenReview (open access) | B |
| BMVC | https://bmva.org/bmvc/ | Open proceedings | B |
| ACM MM | https://acmmm.org/ | Some open access | B |

### Access strategy
- **arXiv API**: Query by category (`cs.CV`, `cs.CR`) + keyword search. Free, no key, high volume.
- **Papers With Code API**: Excellent for finding papers with open-source code. Adds GitHub repo links.
- **Semantic Scholar API**: Good for citation counts, author info, and cross-source deduplication. Free tier: 100 req/5min (unauthenticated), higher with free API key.
- **CVF (CVPR/ICCV/WACV)**: Scrape proceedings page for new papers. PDFs free on CVF.
- **OpenReview (ICLR, NeurIPS)**: API available, open access.

### What NOT to add
- IEEE Xplore — full-text paywalled (only link to abstract if found via other sources)
- ACM DL — full-text paywalled (same rule)
- Springer Link — mostly paywalled
- No social media sources (Twitter, Reddit, LinkedIn)
- No blogs, newsletters, or commentary

---

## 4. What to Track Per Paper

For each paper stored in the database:

```
title            — full paper title
authors          — list of author names
abstract         — full abstract text
published_date   — date first published (arXiv submission date or conference year)
updated_date     — last revision date (arXiv may have multiple versions)
source           — where it was found (arxiv / paperswithcode / semantic_scholar / cvpr / etc.)
source_id        — unique ID in the source system (arXiv ID, S2 paper ID, etc.)
pdf_url          — direct link to PDF (must be free/open)
abstract_url     — link to abstract page
code_url         — GitHub repo link if available (from Papers With Code)
venue            — conference or journal name (CVPR 2024, arXiv, NeurIPS 2023, etc.)
venue_type       — enum: arxiv | conference | journal | workshop
categories       — arXiv categories or domain tags (cs.CV, cs.CR, etc.)
relevance_tags   — auto-assigned topic tags (copy-move, splicing, localization, document, etc.)
relevance_score  — 0.0–1.0 computed score based on keyword match
is_saved         — user bookmarked this paper
read_status      — enum: unread | reading | read | archived
user_notes       — personal notes (Phase B)
citation_count   — from Semantic Scholar (updated periodically)
has_code         — boolean: open-source implementation available
ingest_source    — which adapter found it
created_at       — when row was inserted
```

---

## 5. Relevance Scoring & Filtering

### Relevance scoring (computed at ingest)

Score based on keyword presence in title + abstract:

**High weight keywords (title match = 0.4, abstract match = 0.2 each):**
- forgery detection
- tamper detection
- manipulation detection
- image forensics
- forgery localization
- splicing detection
- copy-move detection
- inpainting detection
- document authentication
- document verification
- ID document
- passport forgery

**Medium weight keywords (title = 0.2, abstract = 0.1 each):**
- image integrity
- deepfake detection
- face swap detection
- GAN detection
- AI-generated image
- pixel-level segmentation
- anomaly localization
- passive authentication
- PRNU / noise analysis
- watermark detection

**Low weight (abstract only = 0.05 each):**
- image authenticity
- digital forensics
- image manipulation
- steganalysis

**Score cap:** 1.0. Papers with score < 0.1 are stored but not surfaced in the default feed.

### Filter dimensions

| Dimension | Options |
|---|---|
| Venue type | arXiv preprint / Conference / Journal / Workshop |
| Venue | CVPR / ICCV / ECCV / NeurIPS / ICLR / WACV / BMVC / arXiv / other |
| Year | 2020 / 2021 / 2022 / 2023 / 2024 / 2025 |
| Has code | Yes / No |
| Topic tag | copy-move / splicing / inpainting / document / localization / GAN / deepfake / text-manipulation / passive-auth / forensics |
| Read status | Unread / Reading / Read / Archived |
| Saved | Yes / All |
| Relevance score | High (>0.6) / Medium (0.3–0.6) / Low (<0.3) |

### Default feed sort options
- Newest first (default)
- Most relevant (by relevance score)
- Most cited (requires Semantic Scholar citation data)
- Saved papers first

---

## 6. Website Features

### Core features (Phase A — MVP)

**Feed view**
- List of papers sorted by newest first
- Each card shows: title, authors, venue + year, abstract excerpt (3 lines), relevance tags, has-code badge
- Click → paper detail page with full abstract, links to PDF and code
- Infinite scroll or pagination (25 papers per page)

**Filter sidebar / sheet**
- Filter by all 8 dimensions listed in §5
- Active filter chips shown above the feed
- URL-synced filters (shareable links)

**Search**
- Full-text search across title + abstract
- Keyword highlight in results

**Paper detail page**
- Full abstract
- All metadata
- PDF link (opens in new tab)
- Code link (opens GitHub)
- One-line AI summary (Phase A2 — optional, cost-capped)
- Manual read status toggle
- Save/bookmark button

**Save & read tracking**
- Bookmark papers for later
- Mark as read / reading / archived
- Saved papers view (filterable subset)

### Phase B additions (after MVP)
- Personal notes per paper
- Email digest (weekly new papers matching your interests)
- Related papers suggestions (via Semantic Scholar API)
- Author tracking (follow a specific researcher)
- Dataset mentions extraction (which benchmark datasets a paper uses)
- Export to BibTeX / CSV

---

## 7. Architecture

### System overview

```
┌──────────────────────────────────────────────────────────────┐
│                       Ingestion Layer                        │
│  Inngest Scheduled Jobs → Source Adapters → Dedup → Store   │
│  (arxiv · paperswithcode · semantic_scholar · cvf · iclr)   │
└───────────────────────────┬──────────────────────────────────┘
                            │ write
┌───────────────────────────▼──────────────────────────────────┐
│                    Supabase (Postgres)                        │
│  papers · relevance_tags · user_saves · read_status ·        │
│  ingest_runs                                                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ read
┌───────────────────────────▼──────────────────────────────────┐
│             Next.js 15 App Router (Frontend)                 │
│  Feed · Filters · Search · Paper Detail · Saved Papers       │
└──────────────────────────────────────────────────────────────┘
```

### Data flow

1. **Ingest** — Inngest fires a scheduled job per source (arXiv: daily, conferences: weekly). Each adapter queries its source, normalises papers into the unified schema, runs deduplication (by arXiv ID, DOI, or title hash), computes relevance score, writes to `papers` table.
2. **Tag** — At ingest time, relevance tags are auto-assigned from keyword matching.
3. **Serve** — Next.js server components query Supabase. Feed is server-rendered with TanStack Query for client-side filter updates.
4. **Filter** — All filter dimensions run client-side on the cached response. Target: <50ms visual update.
5. **Track** — Save/read status written to `user_saves` and `read_status` tables (local user — no auth in Phase A).

### Simplifications vs V2
- No Inngest job queue complexity for multiple users — single-user, single pipeline
- No feedback/rerank loop (removed)
- No AI summarization in Phase A (optional in A2)
- No source quality scoring system
- No auth in Phase A
- Smaller schema — focused on papers only

---

## 8. Tech Stack

Same proven stack from V2, unchanged:

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | CSS Modules + custom properties |
| Database | Supabase (Postgres) |
| ORM | Drizzle ORM |
| Job queue | Inngest |
| Package manager | pnpm |
| Hosting | Vercel + Supabase |
| Testing | Vitest + Playwright |

### Key libraries (paper-tracker specific)

| Purpose | Library |
|---|---|
| arXiv API calls | ky (HTTP) + custom XML parser (arXiv returns Atom XML) |
| Semantic Scholar | ky + JSON (REST API) |
| Conference scraping | cheerio + ky |
| OpenReview | ky + JSON (REST API) |
| Full-text search | Postgres `tsvector` + `tsquery` (no extra dependency) |
| Date handling | date-fns |
| Schema validation | Zod |

### Removed from V2 stack (no longer needed)
- rss-parser (no RSS sources now)
- @upstash/ratelimit (single-user, no user-facing rate limits needed in Phase A)
- Resend (no email in Phase A)

---

## 9. Data Schema

### `papers` table

```sql
papers (
  id              uuid primary key default gen_random_uuid(),
  arxiv_id        text unique,             -- e.g. "2403.12345"
  doi             text,
  title           text not null,
  authors         text[] not null,
  abstract        text not null,
  published_date  date not null,
  updated_date    date,
  source          text not null,           -- 'arxiv' | 'paperswithcode' | 'semantic_scholar' | 'cvf' | 'openreview'
  source_url      text not null,           -- abstract page link
  pdf_url         text,                    -- direct PDF link (free only)
  code_url        text,                    -- GitHub repo if available
  venue           text,                    -- "CVPR 2024" | "arXiv" | "NeurIPS 2023"
  venue_type      text,                    -- 'arxiv' | 'conference' | 'journal' | 'workshop'
  categories      text[],                  -- arXiv categories or topic areas
  relevance_score numeric(3,2) not null,   -- 0.00 to 1.00
  relevance_tags  text[],                  -- auto-assigned topic tags
  has_code        boolean default false,
  citation_count  integer,
  ai_summary      text,                    -- one-line AI summary (nullable, Phase A2)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
)
```

### `user_saves` table

```sql
user_saves (
  id          uuid primary key default gen_random_uuid(),
  paper_id    uuid references papers(id) on delete cascade,
  saved_at    timestamptz default now(),
  notes       text,                        -- Phase B
  unique(paper_id)
)
```

### `read_status` table

```sql
read_status (
  id          uuid primary key default gen_random_uuid(),
  paper_id    uuid references papers(id) on delete cascade,
  status      text not null,               -- 'unread' | 'reading' | 'read' | 'archived'
  updated_at  timestamptz default now(),
  unique(paper_id)
)
```

### `ingest_runs` table

```sql
ingest_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  started_at   timestamptz not null,
  finished_at  timestamptz,
  papers_found integer,
  papers_new   integer,
  error        text,
  status       text not null              -- 'running' | 'success' | 'error'
)
```

---

## 10. Ingestion Strategy

### arXiv adapter (highest priority)

- **API:** `http://export.arxiv.org/api/query` (Atom XML)
- **Categories to search:** `cs.CV` (Computer Vision), `cs.CR` (Cryptography and Security)
- **Query strategy:** Run keyword searches (see §12) against title+abstract daily
- **Rate limit:** arXiv asks for max 3 req/sec, 1 request per second preferred. No key needed.
- **Schedule:** Daily at 06:00 UTC (arXiv publishes new submissions ~00:00 UTC)
- **Dedup:** by `arxiv_id`

### Papers With Code adapter

- **API:** `https://paperswithcode.com/api/v1/` (JSON, free)
- **Strategy:** Search for papers in "image-forgery-detection" task area; also query by keywords
- **Value add:** Provides `code_url` (GitHub link) and implementation status
- **Schedule:** Daily
- **Dedup:** cross-reference arXiv ID if present; else by title hash

### Semantic Scholar adapter

- **API:** `https://api.semanticscholar.org/graph/v1/` (JSON, free key available)
- **Strategy:** Search by keyword; supplement arXiv entries with citation counts
- **Key:** Register for free API key at semanticscholar.org (rate limit: 1 req/sec with key)
- **Schedule:** Daily for new papers; weekly citation count refresh
- **Dedup:** by S2 paper ID and arXiv ID cross-reference

### CVF adapter (CVPR / ICCV / WACV)

- **Strategy:** Scrape the CVF proceedings page for the current year; parse paper titles and PDF links
- **Filter:** Download only papers matching keyword list from title
- **Schedule:** Weekly (conference proceedings don't change daily)
- **Note:** CVF PDFs are free — no paywall

### OpenReview adapter (ICLR / NeurIPS)

- **API:** `https://api.openreview.net/` (JSON, open)
- **Strategy:** Search by venue + keyword in title
- **Schedule:** Weekly
- **Note:** Both ICLR and NeurIPS proceedings are fully open on OpenReview

### Deduplication strategy

1. If `arxiv_id` exists → deduplicate by `arxiv_id`
2. Else if `doi` exists → deduplicate by `doi`
3. Else → compute `title_hash = sha256(normalize(title))`, deduplicate by hash
4. On conflict: update `citation_count`, `code_url` (if newly found), `updated_date`; do NOT overwrite original `published_date`

---

## 11. Phase Roadmap

### Phase A — Single-User MVP (personal use)

| Sub-phase | Deliverable | Done when |
|---|---|---|
| **A0** | New CLAUDE.md, schema design, adapter contracts, keyword list finalised | Planning docs reviewed; repo scaffold ready |
| **A1** | arXiv adapter live + minimal feed UI | Today's new papers visible on screen |
| **A2** | Papers With Code + Semantic Scholar adapters; unified dedup | Three sources merged; code links visible |
| **A3** | CVF + OpenReview adapters; full venue coverage | Papers from CVPR/ICLR/NeurIPS visible |
| **A4** | Relevance scoring + tag auto-assignment | Papers sorted by relevance; tags visible |
| **A5** | Filter sidebar + URL-synced filters | Can filter by venue, year, topic, has-code |
| **A6** | Full-text search (Postgres tsvector) | Can search title + abstract; highlights work |
| **A7** | Save + read status tracking | Can bookmark papers and mark as read |
| **A8** | Paper detail page + AI one-line summary (optional, cost-capped) | Each paper has its own page; Haiku summary |
| **A9** | Production deploy (Vercel + Supabase); HTTPS; CSP headers | Accessible from phone; auto-ingestion running |

**Phase A exits when:** I can open the site on my phone, see today's new papers, filter by topic, and not miss a relevant paper for a week.

### Phase B — Enhancements

- B1: Weekly email digest (new papers matching saved keywords — Resend)
- B2: Related papers panel (Semantic Scholar recommendations API)
- B3: Author tracking (follow specific researchers)
- B4: Dataset mentions extraction (which papers use which benchmarks)
- B5: BibTeX / CSV export
- B6: Mobile PWA (offline reading list)

---

## 12. Keywords & Search Terms

### arXiv search queries (run daily against title + abstract)

**Primary — highest recall:**
```
forgery detection
tamper detection
manipulation detection
image forensics
forgery localization
splicing detection
copy-move detection
inpainting detection
document forgery
document authentication
document verification
```

**Secondary — good recall:**
```
image manipulation localization
passive image authentication
deepfake detection
face swap detection
GAN detection
AI-generated image detection
image integrity verification
pixel-level forgery
text region manipulation
ID document
passport verification
national ID
```

**Tertiary — broad sweep:**
```
image authenticity
digital forensics
steganalysis
noise analysis PRNU
watermark removal detection
anomaly localization image
```

### Relevance tag vocabulary

Auto-assign these tags at ingest based on keyword presence:

| Tag | Trigger keywords |
|---|---|
| `copy-move` | copy-move, copy move, duplication detection |
| `splicing` | splicing, splice, composite image |
| `inpainting` | inpainting, removal detection, object removal |
| `localization` | localization, segmentation mask, pixel-level, region-level |
| `document` | document, passport, ID card, driving license, national ID, OVD |
| `text-manipulation` | text region, OCR tampering, text forgery, altered text |
| `deepfake` | deepfake, face swap, face manipulation, face forgery |
| `gan-detection` | GAN detection, AI-generated, synthetic image, generative |
| `passive-auth` | passive authentication, no watermark, blind detection |
| `forensics` | image forensics, digital forensics, PRNU, noise analysis |
| `transformer` | transformer, ViT, attention-based (useful for architecture filtering) |
| `diffusion` | diffusion model, DDPM (detection of diffusion-generated content) |

---

## 13. Decisions Log

All questions answered 2026-04-19.

| # | Question | Decision |
|---|---|---|
| Q1 | Conference ingestion frequency | **Weekly** (CVF + OpenReview) |
| Q2 | Relevance score threshold | **0.2** — papers below this stored but hidden from default feed |
| Q3 | AI summaries | **Phase B (B1)** — skip for MVP; arXiv abstracts are sufficient |
| Q4 | Seed data depth | **6 months** on first ingest |
| Q5 | Default sort | **Newest first** (by `published_date`) |
| Q6 | IEEE TIFS paywalled papers | **Show abstract + arXiv preprint link if exists**; no full-text PDF link if paywalled |
| Q7 | Primary design target | **Desktop-first** (1024px+; mobile as secondary) |
| Q8 | Visual style | **Minimal / academic** — clean, dense, information-rich (Semantic Scholar style) |

---

*Created: 2026-04-19 | Replaces: Ideas V2.md (general AI aggregator)*
*Next step: Review this doc, answer Open Questions §13, then update CLAUDE.md*
