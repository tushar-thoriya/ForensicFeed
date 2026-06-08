# ForensicFeed

> Personal research paper tracker for image forgery detection & localization.
> Aggregates open-access papers from arXiv, Hugging Face Papers, Semantic Scholar, CVF, and OpenReview — tagged, scored by relevance, filterable by venue/year/topic, **searchable** by full-text.
>
> See `../CLAUDE.md` for the engineering playbook and `../Plan.md` for the task plan.

## Status

Phases shipped: **A1 → A9 — Phase A complete.** Live on Vercel + Supabase; tested across Chrome + desktop/mobile Safari; WCAG 2.1 AA clean on the main surfaces.

| Capability                                                                                          | Where                                                                                        |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Multi-source ingest (arXiv, HF, Semantic Scholar, CVF, OpenReview)                                  | `src/lib/ingestion/` + Inngest cron                                                          |
| Relevance scoring + auto-tagging                                                                    | `src/lib/ingestion/tagger.ts`                                                                |
| Filter sidebar with URL-as-state                                                                    | `src/components/filters/`                                                                    |
| Full-text search (Postgres `tsvector` + GIN, ranked by `ts_rank_cd`, highlighted via `ts_headline`) | `src/components/search/`, `src/lib/search/`, `drizzle/migrations/0003_add_search_vector.sql` |
| Save + read-status tracking (optimistic toggles, `/saved` view, de-emphasized read cards)           | `src/components/paper-actions/`, `src/app/saved/`, `src/lib/db/queries/saves.ts`             |
| Paper detail page + editorial design pass (serif hero, mono meta, eyebrow masthead)                 | `src/app/papers/[id]/`, `src/components/paper-detail/`, `src/styles/tokens.css`              |
| Designed failure screens (feed error boundary, paper 404)                                           | `src/app/error.tsx`, `src/app/papers/[id]/not-found.tsx`, `src/components/status/`           |
| E2E + accessibility coverage (Playwright on 3 browsers, axe WCAG scans, keyboard pass)              | `tests/e2e/` (`a11y.spec.ts`, `failure-screens.spec.ts`, `paper-detail.spec.ts`)             |

## Quick start

```bash
cd app

# Install dependencies
pnpm install

# Copy env template and fill in real values
cp .env.example .env.local

# Generate the first DB migration (run once after schema changes)
pnpm db:generate

# Apply migrations to your Supabase Postgres
pnpm db:migrate

# Run dev server
pnpm dev

# Run all checks
pnpm verify
```

## Tooling

| Command            | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `pnpm dev`         | Next.js dev server                          |
| `pnpm build`       | Production build                            |
| `pnpm test`        | Vitest watch mode                           |
| `pnpm test:ci`     | Vitest with coverage (≥80% gate)            |
| `pnpm e2e`         | Playwright E2E suite                        |
| `pnpm lint`        | ESLint                                      |
| `pnpm format`      | Prettier write                              |
| `pnpm stylelint`   | CSS lint                                    |
| `pnpm typecheck`   | TypeScript noEmit                           |
| `pnpm verify`      | Full pre-push gate                          |
| `pnpm db:generate` | Generate Drizzle migration from schema diff |
| `pnpm db:migrate`  | Apply pending migrations                    |
| `pnpm db:studio`   | Open Drizzle Studio                         |
