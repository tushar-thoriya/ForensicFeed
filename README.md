# ForensicFeed

> A personal research paper tracker for **image forgery detection & localization**.
> Aggregates open-access papers from arXiv, Hugging Face Papers, Semantic Scholar, CVF (CVPR/ICCV/WACV), and OpenReview (ICLR/NeurIPS) — auto-tagged, scored by relevance, filterable by venue/year/topic, sortable by recency or relevance.

Built so I never miss a paper that matters for OVD (Optically Variable Device) document forensics research.

---

## What it does

- **Ingests** new papers daily from 5 sources via Inngest cron jobs
- **Deduplicates** across sources by `arxiv_id → doi → title_hash` priority
- **Scores relevance** with a weighted keyword taxonomy (forgery detection, localization, document auth, deepfake, etc.)
- **Auto-tags** each paper across 12 topic dimensions (`copy-move`, `splicing`, `localization`, `deepfake`, `gan-detection`, `forensics`, `transformer`, `diffusion`, …)
- **Filters** by source, venue type, year, topic tag, has-code — all state lives in the URL
- **Sorts** by newest or most relevant

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router, TypeScript, CSS Modules with custom properties |
| Database | Supabase Postgres + Drizzle ORM (jsonb tags, GIN-ready) |
| Job queue | Inngest (managed durable cron) |
| Testing | Vitest (unit) + Playwright (E2E) |
| Hosting | Vercel + Supabase |

---

## Quick start

```bash
git clone https://github.com/tushar-thoriya/ForensicFeed.git
cd ForensicFeed/app

pnpm install
cp .env.example .env.local        # fill in Supabase + Inngest creds
pnpm db:migrate
pnpm dev
```

See [`app/README.md`](app/README.md) for the full command reference and [`CLAUDE.md`](CLAUDE.md) for the engineering playbook.

---

## Roadmap

### Phase A — Single-user MVP

| Phase | Deliverable | Status |
|---|---|---|
| A1 | arXiv adapter + minimal feed | ✅ shipped |
| A2 | HF Papers + Semantic Scholar adapters; multi-source dedup | ✅ shipped |
| A3 | CVF + OpenReview conference adapters; venue-type badge | ✅ shipped |
| A4 | Filter sidebar; URL-as-state; sort-by-relevance toggle | ✅ shipped |
| A5 | Full-text search (Postgres `tsvector`) | ✅ shipped |
| A6 | Save + read-status tracking; saved papers view | ✅ shipped |
| A7 | Paper detail page; design pass | ✅ shipped |
| A8 | Production deploy (Vercel + Supabase + CSP + monitoring) | next |
| A9 | E2E coverage; a11y sweep; error/empty states | planned |

### Phase B — Enhancements

AI summaries (cost-capped Haiku), weekly email digest, related-papers panel, author tracking, dataset extraction, BibTeX export.

---

## Sources tracked

| Source | Schedule | Dedup key |
|---|---|---|
| arXiv (cs.CV, cs.CR) | Daily 06:00 UTC | `arxiv_id` |
| Hugging Face Papers | Daily 06:15 UTC | `arxiv_id` → title hash |
| Semantic Scholar | Daily 06:30 UTC + weekly citation refresh | S2 paper ID |
| CVF (CVPR / ICCV / WACV) | Weekly Mon 07:00 UTC | Title hash |
| OpenReview (ICLR / NeurIPS) | Weekly Mon 07:30 UTC | OpenReview ID |

Excluded: paywalled venues without a preprint link (IEEE Xplore full-text, ACM DL full-text).

---

## Design principles

1. **Plan before implementing** — every sub-phase ships through a 9-step PRP loop (PRD → plan → research → tests-first → implement → review → viewport+a11y → commit → checkpoint)
2. **Stages, not big-bang** — thin vertical slices per sub-phase, never breaking the previous one
3. **Relevance over completeness** — surface what matters for OVD forgery research, not every CV preprint
4. **Open access only** — every paper has a freely accessible PDF or preprint

---

## Project layout

```
ForensicFeed/
├── CLAUDE.md            # engineering playbook & quality gates
├── Ideas V4.md          # product spec: sources, taxonomy, schema
├── app/                 # Next.js application
│   ├── docs/            # per-phase PRDs and plans (A0–A4 shipped)
│   ├── src/
│   │   ├── app/         # App Router pages + API routes
│   │   ├── components/  # feed, filters
│   │   ├── lib/         # ingestion, db, filters, security
│   │   └── types/
│   └── tests/           # vitest unit + playwright e2e
└── README.md            # ← you are here
```

---

## License

Personal project. Source visible for transparency; no support or warranty implied.
