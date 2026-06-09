# Plan: B2 Phase 2 — Email Template

## Summary

A pure function that turns a `DigestPaper[]` (from Phase 1) into a sendable email:
`{ subject, html, text }`. Editorial styling via **inline literal hex** (email clients
don't support oklch / CSS vars / external CSS). Top-N papers render as full cards; the
remainder as a compact list. A quiet-week variant renders when the list is empty. No
Resend, no cron — Phase 3 consumes this.

## User Story

As the single user, I want the week's papers rendered into a clean, scannable email so
that when Phase 3 sends it, I can skim and click through without opening the site.

## Metadata
- **Complexity**: Small–Medium
- **Source PRD**: `app/docs/B2-PRD.md` (Phase 2)
- **Estimated Files**: 2 (1 source, 1 test)

## Mandatory Reading
| Priority | File | Why |
|---|---|---|
| P0 | `src/lib/db/queries/digest-query.ts` | `DigestPaper` shape the template consumes; `DIGEST_*` constants |
| P1 | `src/styles/tokens.css` (1-25) | Editorial palette/fonts to translate to email-safe hex |
| P1 | `src/components/status/status-screen.css` | Eyebrow/title editorial type scale to echo |
| P2 | `tests/unit/digest-query.test.ts` | Test style (`@vitest-environment node`) |

## External Documentation
| Topic | Key Takeaway |
|---|---|
| HTML email | Inline styles only; no `<style>` reliance, no CSS vars, no oklch; keep layout simple (centered max-width container, `<table>`-free is fine for Gmail); always ship a `text` part |

## Patterns to Mirror

### PURE_FUNCTION + NAMING
```ts
// SOURCE: digest-query.ts — exported constants UPPER_SNAKE, fns camelCase, explicit input interface
export const DIGEST_FULL_CARDS = 5
export interface RenderDigestInput { papers: DigestPaper[]; weekStart: Date; weekEnd: Date; appUrl: string }
export interface RenderedEmail { subject: string; html: string; text: string }
```

### TEST_STRUCTURE
```ts
// @vitest-environment node  (mirror tests/unit/digest-query.test.ts)
```

## Files to Change
| File | Action | Justification |
|---|---|---|
| `src/lib/email/digest-template.ts` | CREATE | Pure renderer: `renderDigestEmail(input) → { subject, html, text }` + `escapeHtml` |
| `tests/unit/digest-template.test.ts` | CREATE | Count→subject, escaping, quiet-week, links, top-N split, authors truncation |

## NOT Building
- Resend send wrapper / Inngest cron (Phase 3)
- Reading env inside the template (appUrl is a param)
- React-email or any new dependency — plain string templating
- Per-paper AI summary (B1, skipped)

## Step-by-Step Tasks

### Task 1: `escapeHtml`
- **ACTION**: New file `src/lib/email/digest-template.ts`.
- **IMPLEMENT**: `function escapeHtml(s: string): string` replacing `& < > " '` with entities
  (order: `&` first). Export it for direct testing.
- **GOTCHA**: arXiv titles/author names are untrusted free text — every interpolated value
  MUST pass through `escapeHtml`. This is the email analogue of the app's XSS rule.
- **VALIDATE**: unit test with `<script>`, `&`, quotes.

### Task 2: Constants + types
- **IMPLEMENT**: `DIGEST_FULL_CARDS = 5`, `RenderDigestInput`, `RenderedEmail` (see pattern).
- **VALIDATE**: typecheck.

### Task 3: Helpers
- **IMPLEMENT**:
  - `formatAuthors(authors: string[]): string` → first 3 joined by ", " + " et al." when >3; "" when empty.
  - `paperUrl(appUrl, id)` → `${appUrl.replace(/\/$/, '')}/papers/${encodeURIComponent(id)}`.
  - `externalUrl(p: DigestPaper)` → `p.pdfUrl` ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : null).
  - `formatScore(n)` → `n.toFixed(2)`.
  - `formatRange(start,end)` → e.g. `Jun 2 – Jun 9, 2026` (use `Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'})`, append year once; UTC timezone to match cron).
- **GOTCHA**: Use `timeZone: 'UTC'` in Intl so the range matches the UTC cron window and tests are deterministic.
- **VALIDATE**: covered via render tests.

### Task 4: `renderDigestEmail` — populated + quiet variants
- **IMPLEMENT**:
  - subject: populated → `ForensicFeed · {N} new paper{s} this week`; quiet → `ForensicFeed · quiet week — no new papers`.
  - html: centered container (max-width ~640px), masthead eyebrow `FORENSICFEED · WEEKLY DIGEST`, the week range, then either:
    - quiet: one short line "No new high-relevance papers this week." + link to feed.
    - populated: top `DIGEST_FULL_CARDS` as full cards (title→in-app link, authors, venue · score, tags, "Read on arXiv/PDF" external link); remaining as compact `<li>` (title link + venue + score). Footer: "Browse all in ForensicFeed →" (appUrl).
  - text: plain-text mirror (title, authors, venue, score, both URLs per paper; quiet line when empty).
  - All interpolated values escaped; all colors inline hex (translate tokens: surface `#fafafa`, text `#1f1f1f`, secondary `#5e5e5e`, muted `#6b6b6b`, border `#e0e0e0`, accent `#3a5bd9`, accent-strong `#2a3fa8`, tag-bg `#eef0f7`, tag-text `#3a4570`).
- **GOTCHA**: No `var(--…)` and no `oklch()` in the HTML — Gmail strips/ignores them. Fonts:
  `font-family:Georgia,'Times New Roman',serif` for headings, system sans for body, monospace for meta.
- **VALIDATE**: render tests below.

### Task 5: Tests
- **ACTION**: `tests/unit/digest-template.test.ts`, `@vitest-environment node`.
- **CASES**:
  - subject reflects count (1 → "1 new paper", 3 → "3 new papers"); quiet subject when empty.
  - html + text contain each paper's title.
  - escaping: title `A <b>& "quoted"</b> tag` appears escaped (`&lt;b&gt;`, `&amp;`, `&quot;`) and NOT raw in html.
  - in-app link `${appUrl}/papers/${id}` present; external arXiv link present when only arxivId; pdfUrl preferred when present.
  - top-N split: with 8 papers and `DIGEST_FULL_CARDS=5`, all 8 titles present; the 6th–8th appear in the compact section (assert a compact-section marker).
  - authors truncation: 5 authors → first 3 + "et al.".
  - quiet-week: empty papers → text/html contain "No new" and a feed link, no card markup.
  - no `oklch(` and no `var(--` substring anywhere in html (email-safety regression).
- **VALIDATE**: `pnpm test:ci`.

## Testing Strategy
| Test | Input | Expected |
|---|---|---|
| subject singular/plural | 1 / 3 papers | "1 new paper" / "3 new papers" |
| subject quiet | [] | "quiet week" |
| escaping | malicious title | entities, no raw `<` |
| in-app link | paper id | `${appUrl}/papers/id` |
| external link | arxivId only | `arxiv.org/abs/…` |
| pdf preferred | pdfUrl set | pdfUrl used |
| top-N split | 8 papers | 8 titles, compact section present |
| authors | 5 authors | 3 + "et al." |
| quiet body | [] | "No new", no cards |
| email-safety | any | no `oklch(`, no `var(--` |

### Edge Cases
- [x] Empty list → quiet variant
- [x] Untrusted chars → escaped
- [x] Missing pdfUrl AND arxivId → external link omitted gracefully
- [x] Empty authors → no "et al.", no crash

## Validation Commands
```bash
cd app && pnpm typecheck && pnpm eslint src/lib/email/digest-template.ts tests/unit/digest-template.test.ts && pnpm vitest run tests/unit/digest-template.test.ts
```
EXPECT: clean + all green.

## Acceptance Criteria
- [ ] `renderDigestEmail` returns `{ subject, html, text }`; quiet variant on empty
- [ ] All interpolated values escaped; no `oklch(`/`var(--` in html
- [ ] Top-N cards + compact remainder; in-app + external links
- [ ] Tests written first; new file ~100% covered
- [ ] typecheck + lint clean

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Unescaped injection in email | M | High | `escapeHtml` on every value + explicit test |
| oklch/var slips into HTML | M | Med (broken Gmail render) | Regression test asserts neither substring |
| Date range off-by-timezone | L | Low | Intl with `timeZone:'UTC'` |

## Notes
- Phase 3 will call `renderDigestEmail({ papers: await fetchWeeklyDigestPapers({since}), weekStart, weekEnd, appUrl: getEnv().NEXT_PUBLIC_APP_URL })` and hand `{subject,html,text}` to Resend.
- Hardcoded hex in the email file is intentional and isolated — email clients can't resolve the oklch CSS-var tokens.
