# CLAUDE.md — Research Paper Tracker: Image Forgery Detection & Localization

> **Working title:** ForensicFeed (or TBD)
> **Current phase:** A0 — Foundations & Planning
> **Source of truth for product spec:** `Ideas V4.md`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Quick-Start Commands](#2-quick-start-commands)
3. [Tech Stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [File Organization](#5-file-organization)
6. [Development Workflow](#6-development-workflow)
7. [PRP Execution Loop](#7-prp-execution-loop)
8. [Quality Gates](#8-quality-gates)
9. [Phase Roadmap](#9-phase-roadmap)
10. [Skills Reference](#10-skills-reference)
11. [Sub-Agents](#11-sub-agents)
12. [Hooks Configuration](#12-hooks-configuration)
13. [Coding Standards](#13-coding-standards)
14. [Testing Requirements](#14-testing-requirements)
15. [Environment Variables](#15-environment-variables)
16. [Security Checklist](#16-security-checklist)

---

## 1. Project Overview

**Research domain:** Tamper detection and localization in image-based documents (photos of official valid documents — passports, national IDs, driving licenses). Input is always a **photo of a document** (JPEG/PNG), never a PDF.

**Problem:** New research papers on image forgery detection appear daily across arXiv, CVPR, NeurIPS, ICCV, and other venues. Most are about general image forgery (not document-specific) but are still directly applicable. Manually monitoring all sources is impossible.

**Solution:** A personal website that automatically aggregates open-access research papers on image forgery detection and localization — tagged, scored by relevance, filterable by venue/year/topic, and searchable — so no relevant paper is ever missed.

**What this is NOT:**
- Not a general AI news aggregator
- Not a social media or blog tracker
- Not a GitHub repo tracker
- Not for PDF document forensics — only image-based document photos
- Not for paywalled papers (IEEE Xplore full-text, ACM DL full-text excluded)

**Design principles:**
1. Plan before implementing — never code without a PRD and plan
2. Stages, not big-bang — thin vertical slices per sub-phase
3. Dev environment first, then production
4. Relevance over completeness — surface papers that matter for OVD forgery research
5. Open access only — every paper must have a freely accessible PDF or preprint

**Source of truth for domain spec:** `Ideas V4.md` — paper sources, relevance scoring, keyword taxonomy, schema, phase roadmap.

---

## 2. Quick-Start Commands

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run tests (watch mode)
pnpm test

# Run tests (CI mode, with coverage)
pnpm test:ci

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Build
pnpm build

# Database migrations
pnpm db:migrate

# Database studio (Supabase)
pnpm db:studio
```

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) | Full-stack, SSR, Vercel-native, React Server Components |
| **Language** | TypeScript (throughout) | One language, strong types, shared schemas |
| **Styling** | CSS Modules + custom properties | Full control, no utility bloat, aligns with design rules |
| **Components** | Fully custom | Anti-template policy — no shadcn/Radix defaults |
| **Database** | Supabase (Postgres) | Hosted Postgres + built-in auth (Phase B) |
| **ORM** | Drizzle ORM | Type-safe, SQL-first, lightweight |
| **Job queue** | Inngest | Managed durable jobs, Next.js-native, retries, observability |
| **Package manager** | pnpm | Fast, strict, disk-efficient |
| **Hosting** | Vercel + Supabase | Seamless Next.js deploy, managed infra |
| **Testing** | Vitest + Playwright | Vitest for unit/integration, Playwright for E2E |
| **Linter** | ESLint (flat config) | Standard TS lint rules |
| **Formatter** | Prettier | Consistent code style |
| **CSS lint** | Stylelint | Enforce CSS Module conventions |

### Key library decisions

| Purpose | Library |
|---|---|
| Data fetching (server state) | TanStack Query (React Query) |
| Schema validation | Zod (shared frontend + backend) |
| Date handling | date-fns |
| HTTP client (ingestion) | ky |
| HTML parsing / scraping | cheerio |
| Full-text search | Postgres `tsvector` + `tsquery` (no extra dependency) |
| Analytics | Vercel Analytics |
| Error monitoring | Sentry (Phase B) |
| Email (Phase B) | Resend |

### Not in this project
- `rss-parser` — no RSS sources
- `@upstash/ratelimit` — single user, no user-facing rate limits needed in Phase A
- `react-hook-form` — no complex forms in Phase A

---

## 4. Architecture

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
│  papers · user_saves · read_status · ingest_runs             │
└───────────────────────────┬──────────────────────────────────┘
                            │ read
┌───────────────────────────▼──────────────────────────────────┐
│             Next.js 15 App Router (Frontend)                 │
│  Feed · Filters · Search · Paper Detail · Saved Papers       │
└──────────────────────────────────────────────────────────────┘
```

### Data flow

1. **Ingest** — Inngest fires scheduled jobs per source. arXiv: daily at 06:00 UTC. Conferences (CVF, OpenReview): weekly. Each adapter queries its source, normalises into the unified paper schema, deduplicates, computes relevance score, writes to `papers` table.
2. **Tag** — At ingest time, `relevance_tags` are auto-assigned from keyword matching against title + abstract. Relevance score (0.0–1.0) is computed using weighted keyword rules (see `Ideas V4.md §5`).
3. **Serve** — Next.js server components query Supabase. Feed is server-rendered; TanStack Query handles client-side filter state.
4. **Filter** — All filter dimensions run client-side on the cached response. Target: <50ms visual update on filter change.
5. **Track** — Save and read status written to `user_saves` and `read_status` tables (no auth in Phase A — single user).

### Source adapters

| Adapter | Source | Schedule | Dedup key |
|---|---|---|---|
| `arxiv` | arXiv API (cs.CV, cs.CR) | Daily | `arxiv_id` |
| `paperswithcode` | Papers With Code API | Daily | `arxiv_id` → title hash |
| `semantic_scholar` | Semantic Scholar API | Daily (new) + weekly (citation refresh) | S2 paper ID |
| `cvf` | CVPR / ICCV / WACV proceedings | Weekly | Title hash |
| `openreview` | ICLR / NeurIPS via OpenReview API | Weekly | OpenReview ID |

### Deduplication strategy

1. If `arxiv_id` present → deduplicate by `arxiv_id`
2. Else if `doi` present → deduplicate by `doi`
3. Else → `title_hash = sha256(normalize(title))`, deduplicate by hash
4. On conflict: update `citation_count`, `code_url` if newly found, `updated_date` — never overwrite `published_date`

### Simplifications vs old V2 plan
- No source quality scoring or lifecycle management
- No feedback / rerank loop
- No auth in Phase A (single user)
- No AI summaries in Phase A (pushed to Phase B)
- 4-table schema — papers, user_saves, read_status, ingest_runs

---

## 5. File Organization

Organized by feature/domain, not by file type:

```
src/
├── app/                              # Next.js App Router pages
│   ├── (feed)/                       # Feed routes (default view)
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── papers/
│   │   └── [id]/
│   │       └── page.tsx              # Paper detail page
│   ├── saved/
│   │   └── page.tsx                  # Saved papers view
│   └── api/
│       ├── papers/
│       ├── saves/
│       ├── read-status/
│       └── inngest/                  # Inngest webhook handler
├── components/
│   ├── feed/
│   │   ├── PaperCard.tsx
│   │   ├── PaperList.tsx
│   │   └── feed.css
│   ├── filters/
│   │   ├── FilterSidebar.tsx         # Desktop sidebar (primary)
│   │   ├── FilterSheet.tsx           # Mobile bottom sheet
│   │   ├── FilterChips.tsx
│   │   └── filters.css
│   ├── paper/
│   │   ├── PaperDetail.tsx
│   │   ├── TagBadge.tsx
│   │   ├── ReadStatusToggle.tsx
│   │   ├── SaveButton.tsx
│   │   └── paper.css
│   └── ui/
│       ├── Button.tsx
│       ├── Badge.tsx
│       ├── SearchInput.tsx
│       └── ui.css
├── hooks/
│   ├── usePapers.ts
│   ├── useFilters.ts
│   ├── useSearch.ts
│   └── useReducedMotion.ts
├── lib/
│   ├── db/                           # Drizzle schema + queries
│   │   ├── schema.ts
│   │   ├── papers.ts
│   │   ├── saves.ts
│   │   └── read-status.ts
│   ├── ingestion/
│   │   ├── adapters/
│   │   │   ├── arxiv.ts
│   │   │   ├── paperswithcode.ts
│   │   │   ├── semantic-scholar.ts
│   │   │   ├── cvf.ts
│   │   │   └── openreview.ts
│   │   ├── dedup.ts
│   │   ├── normalise.ts
│   │   └── tagger.ts                 # Relevance score + tag assignment
│   └── inngest/
│       ├── client.ts
│       ├── ingest-arxiv.ts
│       ├── ingest-conferences.ts
│       └── refresh-citations.ts
├── styles/
│   ├── tokens.css
│   ├── typography.css
│   └── global.css
└── types/
    ├── paper.ts
    └── filter.ts
```

**Rules:**
- Files: 200–400 lines typical, **800 lines hard max**
- Functions: **50 lines max**
- No nesting deeper than 4 levels
- No barrel `index.ts` re-exports for internal modules

---

## 6. Development Workflow

Every feature — no matter how small — follows this sequence. No exceptions.

### Step 0: Research before building

Before writing any code for a new module:
1. `gh search repos` and `gh search code` — find existing implementations
2. Context7 or vendor docs — confirm API/library behavior
3. Check npm registry — prefer proven libraries over hand-rolled
4. Only write net-new code if nothing reusable exists

### Step 1: PRD

Use `/prp-prd` or the `planner` agent to write a short product requirement doc for the sub-phase or feature. Must include: what it does, what it doesn't do, success criteria.

### Step 2: Plan

Use `/prp-plan` to produce a step-by-step implementation plan. Have `architect` or `code-architect` review it before any code is written.

### Step 3: Tests first (`/tdd`)

Write failing tests before the implementation. Red → Green → Refactor.

### Step 4: Implement (`/prp-implement`)

Write the minimal code to pass tests. No gold-plating.

### Step 5: Review

- `code-reviewer` after every meaningful change
- `typescript-reviewer` on TS/JS changes
- `security-reviewer` on: user input, external API calls, scraping

### Step 6: Viewport & a11y

- Playwright viewport checks: 768, 1024, 1440px (desktop-first) + 390px (mobile)
- `a11y-architect` sweep on every new UI surface

### Step 7: Commit & checkpoint

- `/prp-commit` with conventional-commit message
- `/checkpoint` and `/save-session` before moving to next sub-phase

---

## 7. PRP Execution Loop

Every sub-phase (A0 → B6) runs this same 9-step loop. A sub-phase is only **done** when all 9 steps are complete.

```
1. PRD         → /prp-prd        Write requirements for this sub-phase
2. Plan        → /prp-plan       Step-by-step implementation plan
3. Research    → gh search, Context7, npm
4. Tests first → /tdd            Failing tests before code
5. Implement   → /prp-implement  Minimal code to pass tests
6. Review      → code-reviewer + typescript-reviewer + security-reviewer
7. Viewport+a11y → Playwright viewports + a11y-architect sweep
8. Commit      → /prp-commit     Conventional commit
9. Checkpoint  → /checkpoint     Save session before next phase
```

---

## 8. Quality Gates

These apply to **every sub-phase**. Nothing advances until all pass.

### Code quality
- [ ] Tests written first; ≥**80% coverage** on all new code
- [ ] `code-reviewer` pass — no CRITICAL or HIGH issues open
- [ ] `security-reviewer` pass for any code touching user input or external APIs
- [ ] No file >**800 lines**, no function >**50 lines**
- [ ] No deep nesting (>4 levels); use early returns
- [ ] No hardcoded secrets; env-var validation on boot
- [ ] No `console.log` or debug statements committed

### Performance
- [ ] Lighthouse desktop ≥**90** for Performance and Accessibility
- [ ] Core Web Vitals: LCP <2.5s, INP <200ms, CLS <0.1
- [ ] JS bundle budget: <150kb gzipped (feed page)
- [ ] CSS budget: <30kb
- [ ] No layout-triggering animations (`width`, `height`, `top`, `left`)

### UI/UX
- [ ] Works at **390px** (mobile) with no horizontal overflow
- [ ] Desktop layout (1024px+) is primary target
- [ ] Touch targets min 44×44px
- [ ] Keyboard-navigable; focus states visible
- [ ] `prefers-reduced-motion` respected
- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 UI elements)
- [ ] Passes the anti-template check — looks like a real research tool, not a default card grid

### Process
- [ ] Conventional commit; PR has test plan
- [ ] `/checkpoint` and `/save-session` complete
- [ ] Sub-phase definition of done confirmed (see Phase Roadmap §9)

---

## 9. Phase Roadmap

Full details in `Ideas V4.md §11`.

### Phase A — Single-User MVP

| Sub-phase | Core Deliverable | Done when |
|---|---|---|
| **A0** | CLAUDE.md updated, schema designed, adapter contracts written, keyword list finalised, repo scaffold | Planning docs reviewed; hooks + agents wired; lint/test passes |
| **A1** | arXiv adapter live + minimal feed UI | Today's new papers visible; last 6 months seeded |
| **A2** | Papers With Code + Semantic Scholar adapters; unified dedup | Three sources merged; code links and citation counts visible |
| **A3** | CVF + OpenReview adapters; full venue coverage | Papers from CVPR / ICLR / NeurIPS visible in feed |
| **A4** | Relevance scoring + tag auto-assignment; filter sidebar | Papers sorted by relevance; can filter by venue, year, topic, has-code |
| **A5** | Full-text search (Postgres `tsvector`) | Can search title + abstract; results highlight keywords |
| **A6** | Save + read status tracking; saved papers view | Can bookmark papers and track reading progress |
| **A7** | Paper detail page; design pass (typography, tokens, desktop-first layout) | Lighthouse ≥90; anti-template check passes; looks like a real tool |
| **A8** | Production deploy (Vercel + Supabase); HTTPS; CSP headers; ingest health monitoring | Accessible over internet; ingestion running automatically without babysitting |
| **A9** | E2E coverage; a11y sweep; error/empty states | E2E green on Chrome/Firefox/Safari; a11y clean |

**Phase A exits when:** I can open the site, see today's new arXiv papers on image forgery, filter by topic (e.g. localization only), and not miss a relevant paper for a week.

### Phase B — Enhancements

| Sub-phase | Deliverable |
|---|---|
| B1 | AI one-line summaries via Claude Haiku (cost-capped, ~$0.02/day) |
| B2 | Weekly email digest — new papers matching saved keywords (Resend) |
| B3 | Related papers panel (Semantic Scholar recommendations API) |
| B4 | Author tracking — follow specific researchers |
| B5 | Dataset mentions extraction (which benchmarks a paper uses) |
| B6 | BibTeX / CSV export; PWA for offline reading list |

---

## 10. Skills Reference

### ECC Skills (invoke via `/skill-name`)

| Skill | When to use in this project |
|---|---|
| `frontend-design` | Picking visual direction for A7 design pass; avoiding template-looking output |
| `frontend-patterns` | Component composition, state management, URL-as-state for filters |
| `postgres-patterns` | Drizzle schema design, `tsvector` search setup, index strategy |
| `api-design` | Internal API contracts between ingestion and frontend |
| `deployment-patterns` | Vercel + Supabase deployment config; env management |
| `security-review` | Before A8 production deploy |
| `tdd-workflow` | Enforcing red-green-refactor on ingestion, dedup, tagger logic |
| `backend-patterns` | Next.js API route patterns, Inngest job patterns |
| `cost-aware-llm-pipeline` | When adding Haiku summaries in B1 |
| `prompt-optimizer` | When tuning Haiku summarization prompt in B1 |
| `e2e-testing` | Playwright E2E tests for feed, filter, and search flows |
| `seo` | Meta tags, structured data (Phase B) |

### Custom Skills (project-specific, created in A0)

#### `paper-tracker-ingestion`
Patterns for writing source adapters in this project.

**Covers:**
- Adapter interface contract (`fetch(since: Date) → Paper[]`)
- arXiv Atom XML parsing
- Semantic Scholar REST API pagination
- CVF proceedings scraping with cheerio
- OpenReview API usage
- Deduplication strategy (arxiv_id → doi → title hash)
- Paper normalisation to unified schema
- Relevance score + tag computation
- Inngest job wiring per adapter
- Per-adapter error isolation (one failure must not stop others)
- Seed ingest (fetching last 6 months on first run)

**File:** `.agents/skills/paper-tracker-ingestion/SKILL.md`

---

#### `paper-tracker-relevance`
Relevance scoring and keyword taxonomy for image forgery detection papers.

**Covers:**
- Full keyword taxonomy (primary / secondary / tertiary) from `Ideas V4.md §12`
- Weight table: title hit vs abstract hit per keyword tier
- Relevance tag vocabulary (12 tags: copy-move, splicing, localization, document, etc.)
- Tag auto-assignment rules
- Score cap (1.0) and floor (papers stored below 0.1 but not surfaced in default feed)
- When to re-score existing papers (keyword list changes)

**File:** `.agents/skills/paper-tracker-relevance/SKILL.md`

---

## 11. Sub-Agents

### Full roster and phase assignment

| Agent | Role | Phase |
|---|---|---|
| `planner` | PRD writing, roadmap, phase breakdown | A0, every sub-phase start |
| `architect` | System design, data model, API contracts | A0 |
| `code-architect` | Concrete implementation blueprints | A0–A3 |
| `tdd-guide` | Write-tests-first enforcement | Every sub-phase |
| `code-reviewer` | General code quality after every meaningful change | Every sub-phase |
| `typescript-reviewer` | TS/JS specific review | A1+ |
| `database-reviewer` | Schema review, query performance, tsvector index strategy | A1, A5 |
| `a11y-architect` | WCAG 2.2 sweep on every UI surface | A7+ |
| `security-reviewer` | Input handling, external API calls, pre-deploy | A8, Phase B |
| `performance-optimizer` | Desktop perf, bundle budget, render optimization | A7, A9 |
| `e2e-runner` | Critical-flow Playwright E2E | A9, Phase B |
| `doc-updater` | Keep CLAUDE.md and planning docs current | After each sub-phase |
| `refactor-cleaner` | Dead-code cleanup between phases | Between A and B |
| `build-error-resolver` | Unblock build failures fast | When build breaks |

### Model routing

| Model | Use for |
|---|---|
| **Claude Opus** | Architecture decisions (`architect`, `code-architect`), security threat modelling |
| **Claude Sonnet 4.6** | All day-to-day dev work: coding, reviewing, planning, testing |
| **Claude Haiku** | LLM summarization in the app itself (B1); lightweight automation |

### Parallel execution rule

When running independent reviews, always launch in parallel:

```
# Good — single message, parallel agents
Launch in parallel:
  1. typescript-reviewer on lib/ingestion/tagger.ts
  2. database-reviewer on lib/db/schema.ts
  3. security-reviewer on app/api/saves/route.ts

# Bad — sequential for independent work
First typescript-reviewer, then database-reviewer, then security-reviewer
```

---

## 12. Hooks Configuration

Wire these in `.claude/settings.json` for this project.

### PostToolUse hooks (run after every Write or Edit)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "pnpm prettier --write \"$FILE_PATH\"",
        "description": "Format edited file"
      },
      {
        "matcher": "Write|Edit",
        "command": "pnpm eslint --fix \"$FILE_PATH\"",
        "description": "Lint and auto-fix edited file"
      },
      {
        "matcher": "Write|Edit",
        "command": "pnpm tsc --noEmit --pretty false",
        "description": "Type-check after every edit"
      },
      {
        "matcher": "Write|Edit",
        "command": "pnpm stylelint --fix \"$FILE_PATH\"",
        "description": "Lint CSS Modules files"
      }
    ]
  }
}
```

### PreToolUse hook (block oversized writes)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const c=i.tool_input?.content||'';const lines=c.split('\\n').length;if(lines>800){console.error('[Hook] BLOCKED: File exceeds 800 lines ('+lines+' lines). Split into smaller modules.');process.exit(2)}console.log(d)})\"",
        "description": "Block writes that exceed 800 lines"
      }
    ]
  }
}
```

### Stop hook (final build verification)

```json
{
  "hooks": {
    "Stop": [
      {
        "command": "pnpm build",
        "description": "Verify production build at session end"
      }
    ]
  }
}
```

---

## 13. Coding Standards

### Immutability (critical)

Always create new objects, never mutate existing ones:
```typescript
// Wrong
paper.relevanceScore = 0.8

// Correct
const scoredPaper = { ...paper, relevanceScore: 0.8 }
```

### CSS custom properties

All design tokens in `styles/tokens.css`. Never hardcode palette, spacing, or typography:
```css
:root {
  --color-surface: oklch(98% 0 0);
  --color-surface-raised: oklch(96% 0 0);
  --color-text-primary: oklch(18% 0 0);
  --color-text-secondary: oklch(42% 0 0);
  --color-accent: oklch(55% 0.18 250);
  --color-tag-bg: oklch(93% 0.04 250);

  --text-base: clamp(0.9375rem, 0.9rem + 0.2vw, 1rem);
  --text-heading: clamp(1.25rem, 1rem + 1vw, 1.75rem);
  --text-hero: clamp(1.75rem, 1.25rem + 2vw, 2.5rem);

  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;

  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

  --sidebar-width: 280px;
  --content-max: 860px;
}
```

### Animation (compositor-only)

Only animate: `transform`, `opacity`, `clip-path`, `filter` (sparingly).
Never animate: `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size`.

### Naming

- Components: `PascalCase` (`PaperCard`, `FilterSidebar`)
- Hooks: `use` prefix (`usePapers`, `useFilters`)
- CSS classes: kebab-case (`paper-card`, `tag-badge`)
- Constants: `UPPER_SNAKE_CASE` (`MAX_PAPERS_PER_PAGE`, `MIN_RELEVANCE_SCORE`)

### No comments by default

Only add a comment when the WHY is non-obvious: a hidden constraint, an API quirk, a non-obvious invariant. Never explain WHAT the code does.

### Error handling

Handle errors explicitly at every level. Never silently swallow errors. UI-facing code: user-friendly message. Server-side: log full context including source adapter name and request details.

---

## 14. Testing Requirements

### Minimum: 80% coverage on all new code

Three test types required on every sub-phase:

| Type | Tool | What to test |
|---|---|---|
| **Unit** | Vitest | Relevance scorer, keyword tagger, dedup logic, paper normaliser, date utils |
| **Integration** | Vitest | API routes (with Supabase test client), adapter functions, Inngest job logic |
| **E2E** | Playwright | Feed load, filter interactions, search, paper detail, save/read toggle |

### TDD workflow (mandatory)

```
1. Write failing test (RED)
2. Run — must fail
3. Write minimal implementation (GREEN)
4. Run — must pass
5. Refactor (IMPROVE)
6. Verify ≥80% coverage
```

Use `/tdd` or `tdd-guide` agent. Never skip the red step.

### Visual regression (E2E)

Screenshot key breakpoints: 390px (mobile), 768px (tablet), 1024px, 1440px.
Test: feed render, filter open/close, search results, paper detail, empty states, error states.

### Playwright config targets

- Chrome, Firefox, Safari (all three required)
- Desktop: 1280×800 (primary)
- Mobile: iPhone 14 viewport (390×844)

---

## 15. Environment Variables

All secrets in `.env.local` (never committed). Validated at boot via Zod schema.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=           # Server-only, never NEXT_PUBLIC_

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Semantic Scholar (free API key — higher rate limits)
SEMANTIC_SCHOLAR_API_KEY=

# App config
NEXT_PUBLIC_APP_URL=
INGESTION_SEED_MONTHS=6              # How many months back to seed on first run

# Phase B only
ANTHROPIC_API_KEY=                   # For Haiku summaries (B1)
RESEND_API_KEY=                      # For email digest (B2)
SENTRY_DSN=                          # Error monitoring
INGESTION_DAILY_LLM_TOKEN_BUDGET=    # Hard cap for Haiku summarization cost
```

**Rules:**
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — never `NEXT_PUBLIC_`
- `ANTHROPIC_API_KEY` is server-only — never `NEXT_PUBLIC_`
- Validate all required env vars on boot; fail fast with a clear error if missing
- `.env.example` committed to repo with all keys present but values empty

---

## 16. Security Checklist

Run `security-reviewer` agent before every production deploy.

### Mandatory checks before any commit
- [ ] No hardcoded API keys, passwords, or tokens
- [ ] All user input validated with Zod schemas
- [ ] SQL: use Drizzle parameterized queries only — never string concatenation
- [ ] XSS: no `dangerouslySetInnerHTML` without sanitization
- [ ] CSRF protection on all state-changing API routes
- [ ] Error messages don't leak internal details or stack traces
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never passed to client components

### Production headers (A8)

Configure in `next.config.ts`:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{RANDOM}' ...
```

### Ingestion guardrails
- All adapters must honor source API rate limits
- Scraping adapters (CVF) must check `robots.txt` before fetching
- Adapter failures are isolated per source — one failure must not crash the pipeline
- Never store API keys in the database — env/secret manager only
- IEEE TIFS / paywalled papers: store abstract page link only; include arXiv preprint link if found; never link directly to paywalled PDF

---

## References

| Document | What it contains |
|---|---|
| `Ideas V4.md` | Full product spec: paper sources, relevance scoring, keyword taxonomy, schema, phase roadmap |
| `Ideas V4.md §2` | Research domain definition — OVD forgery context and sub-domains to track |
| `Ideas V4.md §3` | Paper sources (all 11 sources, access method, priority) |
| `Ideas V4.md §5` | Relevance scoring rules and filter dimensions |
| `Ideas V4.md §9` | Data schema (papers, user_saves, read_status, ingest_runs) |
| `Ideas V4.md §10` | Ingestion strategy per adapter |
| `Ideas V4.md §11` | Full phase roadmap (A0–A9 and B1–B6) |
| `Ideas V4.md §12` | Full keyword list and relevance tag vocabulary |
| `Ideas V4.md §13` | Open questions (Q1–Q8 — answer before finalising A0) |
| `.agents/skills/paper-tracker-ingestion/SKILL.md` | Ingestion adapter patterns |
| `.agents/skills/paper-tracker-relevance/SKILL.md` | Relevance scoring and tagging patterns |

---

*Last updated: 2026-04-19 | Phase: A0 | Decisions locked: desktop-first, 6-month seed, no AI summaries in Phase A, relevance threshold 0.2, newest-first sort, weekly conference ingestion*
*Next action: Answer open questions in `Ideas V4.md §13`, then run `/prp-prd` to generate A0 PRD*
