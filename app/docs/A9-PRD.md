# A9 — E2E Coverage, Accessibility Sweep & Error/Empty States

## Problem Statement

ForensicFeed is live and functional (A1–A8 shipped), but nothing automatically catches regressions, the site has not been verified for keyboard/screen-reader users, and two failure paths (a failed feed load and a non-existent paper URL) currently fall back to Next.js defaults instead of intentional screens. As the sole user who relies on this tool to not miss a relevant paper for a week, an undetected break in filtering or search means silently missing papers.

## Evidence

- Existing E2E coverage is partial: `tests/e2e/home.spec.ts`, `filters.spec.ts`, `search.spec.ts` exist, but there are **no tests for the paper-detail flow or the save/read-status toggle** — two core interactions.
- No `app/src/app/error.tsx` and no `app/src/app/papers/[id]/not-found.tsx` exist — feed-load failures and bad paper IDs hit framework defaults, not designed screens.
- No accessibility tooling is installed (`@axe-core/playwright` absent from `package.json`); a11y has never been measured.
- Empty states are **already built** — `src/components/feed/EmptyState.tsx` covers `no-papers`, `no-matches`, `no-search-matches`, `nothing-saved` and is wired into `page.tsx` and `saved/page.tsx`. This narrows A9 scope.

## Proposed Solution

Close the three remaining Phase-A gaps with the smallest reliable surface: (1) trim the Playwright browser matrix to Chrome + Safari and add smoke tests for the two uncovered critical flows; (2) add automated axe scans plus a manual keyboard pass and fix what they surface; (3) add the two missing failure screens (feed error boundary, paper-not-found) that reuse existing design tokens and the established `EmptyState` visual language. Tests run locally only — no CI pipeline.

## Key Hypothesis

We believe a small local smoke suite + an a11y sweep + intentional failure screens will let the single user trust the tool and catch breakage before pushing.
We'll know we're right when `pnpm e2e` passes green on Chrome + Safari covering all critical flows, axe reports zero violations on the three main surfaces, every control is keyboard-reachable, and no failure path shows a raw framework default.

## What We're NOT Building

- **CI / GitHub Actions** — user runs tests locally before pushing; no cloud pipeline. (Decision locked.)
- **Firefox coverage** — Chrome + Safari (WebKit) only. (Decision locked.)
- **Comprehensive/exhaustive E2E** — smoke / critical-path only, not multi-filter permutations or pagination edge cases. (Decision locked.)
- **New empty-state designs** — the existing `EmptyState` component is sufficient; we only add the two missing *error* screens.
- **New app features** — A9 is hardening, not functionality.

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| E2E smoke suite green | 100% pass on Chrome + Safari | `pnpm e2e` locally |
| Critical flows covered | feed load, filter, search, paper detail, save/read toggle | Test file review |
| Automated a11y violations | 0 on feed, paper detail, saved | `@axe-core/playwright` scan |
| Keyboard reachability | Every interactive control reachable + visible focus | Manual keyboard pass |
| Failure screens | feed-error + paper-404 designed, no framework defaults | Manual verification |

## Open Questions

- [x] ~~Should mobile Safari (iPhone viewport) be part of the smoke run, or desktop Safari only?~~ **Resolved: include iPhone WebKit** — same engine, mobile is a stated target.
- [ ] Does the manual keyboard pass surface focus-trap issues in the mobile filter sheet that require component changes vs. CSS-only fixes? (Unknown until tested.)

---

## Users & Context

**Primary User**
- **Who**: The single researcher-owner of ForensicFeed (you), tracking image-forgery detection papers.
- **Current behavior**: Opens the live site, filters/searches, saves papers, reads detail pages.
- **Trigger**: Pushing a change and wanting confidence it didn't break the feed/filter/search.
- **Success state**: Run one command, see green, push without fear; the site works for keyboard use and never shows a broken/blank screen.

**Job to Be Done**
When I push a change to ForensicFeed, I want to confirm in one local run that the core flows still work and nothing shows a broken screen, so I can trust the tool to never silently drop a relevant paper.

**Non-Users**
Multi-user / collaborative scenarios, automated CI gatekeeping, and Firefox users — explicitly out of scope for this single-user, locally-tested phase.

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Trim Playwright matrix to chromium + webkit (desktop Safari) + iPhone WebKit (mobile Safari) | Locked browser decision; removes Firefox/Pixel noise |
| Must | Smoke E2E: paper-detail flow | Currently uncovered critical path |
| Must | Smoke E2E: save + read-status toggle | Currently uncovered critical path |
| Must | `@axe-core/playwright` automated scans on feed, paper detail, saved | a11y has never been measured |
| Must | Manual keyboard pass + fix focus/reachability issues | Tools miss ~60% of keyboard problems |
| Must | `error.tsx` feed/global error boundary | No designed feed-failure screen exists |
| Must | `not-found.tsx` for `papers/[id]` (paper 404) | No designed paper-404 screen exists |
| Should | Keep/curate existing visual snapshot tests | Already present in `home.spec.ts`; retain at chosen viewports |
| Could | axe scan on error/empty screens too | Nice for completeness |
| Won't | CI pipeline, Firefox, exhaustive E2E, new empty states | Locked out of scope |

### MVP Scope

Validate the hypothesis with: trimmed browser config + 2 new smoke specs + axe scans wired into Playwright + a documented keyboard pass with fixes + 2 new failure screens. The existing `EmptyState` component is reused as-is for empty paths.

### User Flow

Critical path the smoke suite must protect:
`open feed → apply a filter → search → open a paper detail → save it → toggle read status` — plus the failure branches: `bad paper URL → paper-not-found screen` and `feed query fails → feed error screen`.

---

## Technical Approach

**Feasibility**: HIGH — Playwright is already configured (`playwright.config.ts`), E2E scaffolding and screenshots exist, empty states are done, and Next.js App Router gives `error.tsx`/`not-found.tsx` for free.

**Architecture Notes**
- `playwright.config.ts` currently defines 6 projects (chromium, firefox, webkit, iPhone 12, Pixel 5, viewport-320). A9 trims to **chromium + webkit (desktop Safari) + iPhone 12 (mobile Safari)**, removing firefox and Pixel 5.
- New error screens are App Router conventions placed alongside existing routes: a route-level/global `error.tsx` and `papers/[id]/not-found.tsx` triggered via `notFound()` when `getPaperById` returns null.
- Failure screens reuse `styles/tokens.css` and mirror the `.empty-state` visual language for consistency.
- axe integration via `@axe-core/playwright` (`AxeBuilder`) asserting zero violations inside existing/new specs.

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| WebKit-only flakiness in save/read toggle (timing) | M | Use deterministic Playwright waits (role/locator), no fixed timeouts |
| Keyboard pass surfaces real focus bugs in mobile filter sheet | M | Scope CSS-first fixes; escalate to component change only if needed |
| axe flags pre-existing contrast/label issues requiring rework | M | Treat as expected A9 work; fix at source in tokens/components |
| Empty/error E2E needs seeded "no results" data | L | Use a guaranteed-no-match search query rather than DB manipulation |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently
  DEPENDS: phases that must complete first
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Browser matrix + E2E smoke | Trim Playwright to Chrome+Safari; add paper-detail + save/read-toggle specs | complete | - | - | `app/docs/A9-PHASE1-PLAN.md` |
| 2 | Failure screens | Add `error.tsx` (feed error) + `papers/[id]/not-found.tsx` (paper 404) | pending | with 3 | - | - |
| 3 | a11y sweep | Add `@axe-core/playwright`, scan feed/detail/saved, manual keyboard pass, fix issues | pending | with 2 | - | - |
| 4 | Verify + commit | Full `pnpm verify` + `pnpm e2e` green; conventional commit; checkpoint | pending | - | 1, 2, 3 | - |

### Phase Details

**Phase 1: Browser matrix + E2E smoke** — ✅ COMPLETE (2026-06-06)
- **Goal**: Reliable smoke coverage of all critical flows on Chrome + Safari only.
- **Scope**: Edit `playwright.config.ts` → keep chromium, webkit, iPhone 12; drop firefox + Pixel 5; add `paper-detail.spec.ts` and `save-read.spec.ts`; confirm existing home/filters/search specs still pass.
- **Success signal**: `pnpm e2e` green on chromium + desktop Safari + mobile Safari covering feed, filter, search, detail, save/read.
- **Delivered**:
  - Matrix trimmed to chromium + webkit + iPhone 12 (mobile Safari). `viewport-320` also dropped (390px overflow still covered in `home.spec`).
  - `tests/e2e/paper-detail.spec.ts` — navigate→detail, save toggle, read toggle (consolidated; save/read asserted on the single-instance detail page, run `serial`).
  - Final suite: **0 failed · 3 flaky (pass on retry) · 69 passed** across all 3 browsers.
- **Out-of-scope fixes that surfaced while getting the suite green** (would otherwise have blocked the gate):
  - **DB:** `papers.search_vector` column was missing — migration `0003` was journaled as applied but never created the column. Applied the column + GIN index directly via DDL. ⚠️ **Production likely also missing it** — `db:migrate` will skip 0003; verify/repair prod separately.
  - **Flakiness:** added `tests/e2e/global-setup.ts` (warms dev routes serially) + `retries: 1` locally to kill the Next dev cold-start `ERR_ABORTED` race.
  - **Locator bug:** `filters.spec.ts` `getByLabel('Filters')` matched both the desktop `<aside>` and the mobile `<dialog>`; switched to the `complementary` role.
  - **⚠️ Not fixed (environment-blocked):** ESLint can't resolve `eslint-plugin-react-hooks` — pnpm store/symlink `EPERM` in the sandbox. Fix on the dev machine with `pnpm install`. Blocks `pnpm verify` until done.

**Phase 2: Failure screens**
- **Goal**: No failure path shows a raw framework default.
- **Scope**: `app/src/app/error.tsx` (feed load failure, retry action); `app/src/app/papers/[id]/not-found.tsx` (paper 404, link back to feed); wire `notFound()` when paper missing. Reuse tokens + `.empty-state` styling.
- **Success signal**: Bad paper URL and forced feed error both render designed screens.

**Phase 3: a11y sweep**
- **Goal**: Measured, keyboard-usable accessibility on the three main surfaces.
- **Scope**: Install `@axe-core/playwright`; add axe assertions (0 violations) for feed, paper detail, saved; manual keyboard pass through filters, search, save, read toggle, paper links; fix focus visibility/reachability findings at source.
- **Success signal**: axe reports 0 violations; every control reachable by keyboard with visible focus.

**Phase 4: Verify + commit**
- **Goal**: Phase A done.
- **Scope**: `pnpm verify` + `pnpm e2e` green; conventional commit; `/checkpoint`.
- **Success signal**: All gates pass; A9 marked complete; Phase A exit criteria met.

### Parallelism Notes

Phases 2 and 3 are independent — failure screens (route files) and the a11y sweep touch different surfaces and can proceed concurrently. Phase 1 stands alone first to establish the browser matrix the other E2E/axe runs use. Phase 4 gates on all three.

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Test execution location | Local only | GitHub Actions CI | Single-user personal tool; user runs tests before pushing |
| E2E depth | Smoke / critical-path | Comprehensive | Lower maintenance, low flakiness; covers "is it fundamentally broken" |
| Browser matrix | Chrome + desktop Safari + mobile Safari (iPhone) | All three / Chrome-only | Covers desktop + mobile WebKit; skips low-value Firefox |
| a11y depth | Automated (axe) + manual keyboard | Automated only | Scanners miss keyboard/focus issues critical for daily use |
| Empty/error states | Add 2 error screens; reuse existing empty states | Rebuild all states | `EmptyState` already covers empty cases; only error screens missing |

---

## Research Summary

**Market Context**
N/A — single-user internal tool; no competitive/market research warranted. Standard practice (Playwright smoke + axe + App Router error/not-found conventions) applies directly.

**Technical Context**
- `playwright.config.ts` already configured with webServer + 6 projects → trim to 2–3.
- E2E present: `home.spec.ts` (render, overflow, visual snapshots at 390/768/1024/1440), `filters.spec.ts`, `search.spec.ts`. Gaps: paper detail, save/read toggle.
- `EmptyState.tsx` already handles all four empty variants and is wired into `page.tsx` + `saved/page.tsx`.
- Missing: `error.tsx`, `papers/[id]/not-found.tsx`, any axe dependency.
- `pnpm verify` script already chains format/lint/stylelint/typecheck/test:ci/build for the final gate.

---

*Generated: 2026-06-06*
*Status: DRAFT - needs validation*
