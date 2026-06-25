---
name: paper-tracker-code-review
description: ForensicFeed-specific code review checklist — ingestion isolation, dedup invariants, tsvector/SQL safety, XSS/SSRF surfaces, security headers, and the repo's size/immutability/a11y gates. Use before every commit and PR.
---

# ForensicFeed — Code Review Checklist

Scope: the review pass run on any change to this repo before commit/PR. Complements the generic `code-reviewer`, `typescript-reviewer`, and `security-reviewer` agents by encoding **this project's** invariants — the ones a general reviewer won't know.

Source of truth: `CLAUDE.md §8` (Quality Gates), `§13` (Coding Standards), `§16` (Security Checklist), and `Ideas V4.md`.

Severity follows `~/.claude/rules/common/code-review.md`: **CRITICAL** blocks merge · **HIGH** should fix before merge · **MEDIUM** consider · **LOW** optional.

---

## How to run a review

1. `git diff main...HEAD` — review the whole branch, not just the last commit.
2. Identify which **surfaces** the diff touches (see the surface map below) and run only those sections.
3. Launch the matching agents in parallel (see `CLAUDE.md §11`), e.g. `typescript-reviewer` on adapters + `database-reviewer` on queries + `security-reviewer` on API routes.
4. Report findings by severity. Block on any open CRITICAL.

### Surface map — which section applies

| If the diff touches…                          | Run section                          |
| --------------------------------------------- | ------------------------------------ |
| `src/lib/ingestion/adapters/*`                | Ingestion adapters                   |
| `src/lib/ingestion/dedup.ts`, `run.ts`        | Dedup & upsert                       |
| `src/lib/ingestion/tagger.ts`                 | → defer to `paper-tracker-relevance` |
| `src/lib/db/queries/*`, `schema.ts`           | Database & search                    |
| `src/app/api/**/route.ts`                     | API routes                           |
| `src/lib/security/*`, `src/lib/email/*`       | XSS / SSRF / injection               |
| `next.config.ts`                              | Security headers                     |
| `src/components/**`, `src/app/**/page.tsx`    | Frontend & a11y                      |
| anything                                      | Code quality (always)                |

---

## Ingestion adapters — `src/lib/ingestion/`

- [ ] **CRITICAL — per-adapter error isolation.** One adapter throwing must NOT abort the others. A failure is logged with the adapter name and the run continues. Check the orchestration in `run.ts` / the Inngest functions still wrap each adapter independently.
- [ ] **CRITICAL — output conforms to the unified schema.** Adapter returns the normalised `Paper` shape from `src/lib/ingestion/types.ts`. No raw source fields leak through.
- [ ] **HIGH — rate limits honored.** Adapter respects the source's documented rate limit / pagination. Semantic Scholar uses the API key when present.
- [ ] **HIGH — scraping adapters check `robots.txt`.** `cvf.ts` (and any cheerio scraper) must not fetch disallowed paths.
- [ ] **HIGH — paywalled handling.** IEEE TIFS / paywalled: store the abstract-page link only, attach an arXiv preprint link if found, never link a paywalled PDF directly (`CLAUDE.md §16`).
- [ ] **MEDIUM — `fetch(since)` is incremental.** Daily runs query only since the last run; only seed (`INGESTION_SEED_MONTHS`) reaches back 6 months.
- [ ] **MEDIUM — external responses are validated** (Zod or explicit guards) before normalising. Never trust source HTML/JSON shape.

## Dedup & upsert — `dedup.ts`, `run.ts`

- [ ] **CRITICAL — dedup key priority is `arxiv_id` → `doi` → `title_hash`.** `title_hash = sha256(normalize(title))`. Don't reorder.
- [ ] **CRITICAL — on conflict, `published_date` is never overwritten.** Only `citation_count`, `code_url` (if newly found), and `updated_date` may change (`CLAUDE.md §4`).
- [ ] **HIGH — title normalisation is stable** (case, whitespace, punctuation) so the same paper from two sources collides.

## Database & search — `src/lib/db/`

- [ ] **CRITICAL — parameterized queries only.** Drizzle query builder or `sql` template with bound params. No string concatenation of user input into SQL.
- [ ] **CRITICAL — tsvector/tsquery search sanitises the query string.** Search comes from the user — confirm `parse-query.ts` / `ts_headline` usage can't inject raw tsquery operators or control chars. Verify against `tests/unit/parse-query.test.ts`.
- [ ] **HIGH — default-feed threshold 0.2 enforced at query time**, not at the scorer. Papers below 0.2 are stored but filtered out of the default feed.
- [ ] **HIGH — list queries are bounded.** Pagination/`LIMIT` present; no unbounded `SELECT *` over `papers`.
- [ ] **MEDIUM — newest-first sort** is the default ordering (locked decision).
- [ ] **MEDIUM — indexes** exist for the columns being filtered/sorted (venue, year, published_date, tsvector). Flag missing ones for `database-reviewer`.

## API routes — `src/app/api/**/route.ts`

- [ ] **CRITICAL — input validated with Zod** before use (saves, read-status, ingest triggers).
- [ ] **CRITICAL — `SUPABASE_SERVICE_ROLE_KEY` never reaches a client component** and never appears under a `NEXT_PUBLIC_` name.
- [ ] **HIGH — state-changing routes are protected.** Ingest/manual-trigger routes require the Inngest signing key or an equivalent guard — not openly invokable.
- [ ] **HIGH — error responses don't leak internals.** No stack traces, SQL, or env values in the response body. Full context is logged server-side only.

## XSS / SSRF / injection — `src/lib/security/`, `render-highlight.tsx`, `src/lib/email/`

- [ ] **CRITICAL — every outbound paper URL passes the sanitiser** in `src/lib/security/url.ts` (blocks `javascript:` and SSRF-range hosts). Any new place that renders a `pdf_url` / `code_url` / `landing_url` must route through it.
- [ ] **CRITICAL — `dangerouslySetInnerHTML` is allowed only in `render-highlight.tsx`**, and only on output already escaped by that module. Any new occurrence anywhere else is a block until proven sanitised. Grep the diff for it.
- [ ] **CRITICAL — email HTML escapes all interpolated values.** `digest-template.ts` must HTML-escape paper titles/abstracts before injecting into the email body.
- [ ] **HIGH — no user/source string reaches an HTML sink unescaped.** Treat every adapter-sourced field as untrusted.

## Security headers — `next.config.ts`

- [ ] **HIGH — the header set is present and unweakened:** HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking camera/mic/geo, and a CSP. Flag any new `'unsafe-inline'`/`'unsafe-eval'` added to `script-src`.

## Frontend & a11y — `src/components/`, `src/app/**`

- [ ] **HIGH — compositor-only animation.** Only `transform`, `opacity`, `clip-path`, `filter`. Never animate `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size`.
- [ ] **HIGH — no hardcoded design values.** Colors, spacing, type, durations come from `styles/tokens.css` custom properties.
- [ ] **HIGH — keyboard + focus.** Interactive elements are reachable and have a visible focus state; `prefers-reduced-motion` respected.
- [ ] **HIGH — no horizontal overflow at 390px**; desktop (1024px+) is the primary target; touch targets ≥ 44×44px.
- [ ] **MEDIUM — semantic HTML first** (`header`/`nav`/`main`/`section`), not generic `div` stacks. Error/empty/loading states exist for each new surface.
- [ ] **MEDIUM — anti-template check.** Looks like a real research tool, not a default card grid (`CLAUDE.md §8`).

## Code quality — always

- [ ] **CRITICAL — no hardcoded secrets.** No API keys/tokens/passwords in source. Env access goes through the validated `src/lib/env.ts`.
- [ ] **HIGH — immutability.** New objects via spread/copy; never mutate inputs (`{ ...paper, relevanceScore }`, not `paper.relevanceScore = …`).
- [ ] **HIGH — size limits.** No file > 800 lines, no function > 50 lines, no nesting > 4 levels (use early returns).
- [ ] **HIGH — errors handled explicitly** at every level; nothing silently swallowed. UI-facing → friendly message; server-side → full logged context.
- [ ] **MEDIUM — no `console.log` / debug statements** committed.
- [ ] **MEDIUM — comments only when the WHY is non-obvious** (API quirk, hidden constraint). Never narrate WHAT the code does.

## Testing — always

- [ ] **HIGH — tests written first** for new logic; ≥ 80% coverage on changed `src/lib` code.
- [ ] **HIGH — the right test type exists:** unit for scorer/dedup/normalise/adapters, integration for API routes + Inngest logic, Playwright E2E for feed/filter/search/detail/save flows (Chrome + Firefox + Safari).
- [ ] **MEDIUM — adapter changes update the fixture** in `tests/fixtures/` and assert against it rather than hitting the live source.

---

## Quick grep gate

Run these against the diff before approving:

```bash
# Block: dangerouslySetInnerHTML outside the one allowed module
git diff main...HEAD -- 'app/src/**' | grep -n 'dangerouslySetInnerHTML' \
  | grep -v 'render-highlight'

# Block: a NEXT_PUBLIC_ name carrying a service/secret key
git diff main...HEAD | grep -nE 'NEXT_PUBLIC_.*(SERVICE_ROLE|SECRET|SIGNING|ANTHROPIC|RESEND)'

# Warn: layout-animating CSS properties
git diff main...HEAD -- '*.css' | grep -nE 'transition:.*(width|height|top|left|margin|padding|font-size)'

# Warn: stray debug logging
git diff main...HEAD -- 'app/src/**' | grep -nE '^\+.*console\.(log|debug)'
```

Any hit on the first two is CRITICAL; the last two are MEDIUM.

---

## Approval criteria

- **Approve:** no open CRITICAL or HIGH.
- **Warn (merge with caution):** only HIGH remain, each acknowledged.
- **Block:** any open CRITICAL.

## Do not

- Do not re-review the relevance scorer here — defer to `paper-tracker-relevance` for scoring/tagging correctness.
- Do not approve a diff that adds a new external-fetch surface without confirming error isolation and input validation.
- Do not wave through "small" frontend changes without the a11y + token + 390px checks — they're the easiest gates to silently regress.
