# A0 — Foundations & Planning (PRD)

**Status:** In progress
**Sub-phase:** A0 (Plan.md)
**Date opened:** 2026-04-20
**Owner:** tusharpatel
**Spec:** `Ideas V4.md` · **Process:** `CLAUDE.md`

---

## Goal

Lock the foundations for the Research Paper Tracker before any ingestion or UI work. By the end of A0, the project has: a reviewed 4-table schema, a typed adapter contract, a working relevance scorer + 12-tag auto-assigner (tested), two project-local skill docs codifying how adapters and relevance scoring work, a validated V4 env schema, and verified hooks.

## Non-goals

- Any source adapter implementation beyond the existing arXiv scaffold (that's A1+).
- UI polish, tokens, typography passes (A7).
- Filter logic, search, saves, read status (A4–A6).
- Any production deploy concern (A8).

## Inputs (already landed — do not regress)

| Artifact                               | Location                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| 4-table Drizzle schema                 | `src/lib/db/schema.ts` — `papers`, `user_saves`, `read_status`, `ingest_runs` + enums |
| Adapter contract                       | `src/lib/ingestion/types.ts` — `Adapter`, `AdapterFetchOptions`, `RunResult`          |
| `NormalisedPaper` type                 | `src/types/paper.ts`                                                                  |
| Zod V4 env schema                      | `src/lib/env.ts`                                                                      |
| Hooks config                           | `.claude/settings.json` (root) — prettier/eslint/stylelint post, 800-line pre guard   |
| Existing arXiv adapter (A1 spill-over) | `src/lib/ingestion/adapters/arxiv.ts` + fixture + tests                               |

## A0 deliverables (this PRD)

| #   | File                                              | Purpose                                     |
| --- | ------------------------------------------------- | ------------------------------------------- |
| 1   | `tests/unit/relevance.test.ts`                    | Failing tests for scorer + tagger (TDD red) |
| 2   | `src/lib/ingestion/tagger.ts`                     | Relevance scorer + 12-tag auto-assigner     |
| 3   | `.agents/skills/paper-tracker-ingestion/SKILL.md` | Ingestion adapter patterns skill            |
| 4   | `.agents/skills/paper-tracker-relevance/SKILL.md` | Scoring + tagging skill                     |
| 5   | `docs/A0-PRD.md`                                  | This file                                   |

Optional housekeeping (if time permits):

- Stale `docs/A1-PRD.md` (V2-era "GitHub trending") rewrite or delete — deferred to A1 kickoff.
- `Plan.md` Current Status table: flip A0 to `🔄 In progress` / `✅ Done`.

## Relevance scorer contract

Source of truth: `Ideas V4.md §5` + `§12`.

### Input

```ts
interface RelevanceInput {
  title: string
  abstract: string | null
}
```

### Output

```ts
interface RelevanceResult {
  score: number // 0.0–1.0, capped
  tags: string[] // subset of the 12-tag vocabulary, deduplicated, stable order
}
```

### Keyword weight table

| Tier   | Title match | Abstract match | Keywords                                                                                                                                                                                                                                         |
| ------ | ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High   | +0.4        | +0.2           | forgery detection, tamper detection, manipulation detection, image forensics, forgery localization, splicing detection, copy-move detection, inpainting detection, document authentication, document verification, ID document, passport forgery |
| Medium | +0.2        | +0.1           | image integrity, deepfake detection, face swap detection, GAN detection, AI-generated image, pixel-level segmentation, anomaly localization, passive authentication, PRNU, noise analysis, watermark detection                                   |
| Low    | 0           | +0.05          | image authenticity, digital forensics, image manipulation, steganalysis                                                                                                                                                                          |

### Rules

1. Case-insensitive, whole-phrase matching (`"copy-move detection"` matches `Copy-Move Detection` but not `copymove`).
2. **Title is also counted in the abstract scan** — a title keyword contributes only the title weight (no double-counting).
3. Multiple distinct keywords each contribute their weight; a single keyword matched in both title and abstract counts as title-only.
4. Score **cap = 1.0**. Score **floor = 0.0** (no negative scores).
5. Threshold **0.2** (below = stored but hidden from default feed — enforced at query time, not scorer time).
6. Deterministic: same input → same output.

### 12-tag vocabulary

From `Ideas V4.md §12`. Case-insensitive substring match over `title + " " + (abstract ?? "")`:

| Tag                 | Trigger keywords                                               |
| ------------------- | -------------------------------------------------------------- |
| `copy-move`         | copy-move, copy move, duplication detection                    |
| `splicing`          | splicing, splice, composite image                              |
| `inpainting`        | inpainting, removal detection, object removal                  |
| `localization`      | localization, segmentation mask, pixel-level, region-level     |
| `document`          | document, passport, ID card, driving license, national ID, OVD |
| `text-manipulation` | text region, OCR tampering, text forgery, altered text         |
| `deepfake`          | deepfake, face swap, face manipulation, face forgery           |
| `gan-detection`     | GAN detection, AI-generated, synthetic image, generative       |
| `passive-auth`      | passive authentication, no watermark, blind detection          |
| `forensics`         | image forensics, digital forensics, PRNU, noise analysis       |
| `transformer`       | transformer, ViT, attention-based                              |
| `diffusion`         | diffusion model, DDPM                                          |

Tags returned in the stable order above (not insertion order) so ordering is deterministic.

## Test plan (TDD red step)

`tests/unit/relevance.test.ts` must cover:

- Empty input → score 0, tags [].
- High-weight title hit only → 0.4.
- High-weight abstract hit only → 0.2.
- Multiple high-weight title hits → sum, capped at 1.0.
- Medium + low combination math.
- Title + abstract for the **same** keyword → counted once (title weight).
- Tag assignment: `"copy-move detection on passports"` → includes `copy-move`, `document`.
- Tag assignment returns tags in the canonical order.
- Case-insensitivity for both scoring and tagging.
- No stemming — `forgeries` must NOT trigger `forgery detection`.
- Deterministic output (same input → same output on repeat call).

## Done when

- [ ] `pnpm test` passes, coverage ≥80% on `tagger.ts`.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean.
- [ ] `.agents/skills/paper-tracker-ingestion/SKILL.md` exists with sections: adapter contract, per-source notes, dedup strategy, error isolation, seed ingest.
- [ ] `.agents/skills/paper-tracker-relevance/SKILL.md` exists with the weight table, tag vocabulary, and re-scoring guidance.
- [ ] Hooks verified to fire on edit of an `app/` file (format + lint + stylelint where applicable).
- [ ] `code-reviewer` + `typescript-reviewer` run on the scorer; no CRITICAL/HIGH open.
- [ ] `Plan.md` Current Status flipped for A0.
