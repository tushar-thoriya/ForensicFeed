---
name: paper-tracker-relevance
description: Keyword taxonomy, weight table, tag vocabulary, and re-scoring rules for the image forgery paper tracker's relevance scorer.
---

# Paper Tracker — Relevance Scoring & Tagging

Scope: how to compute `relevance_score` and `relevance_tags` for each paper at ingest time.

Source of truth: `Ideas V4.md §5` (scoring) and `§12` (keyword taxonomy + tag vocabulary).

Implementation: `app/src/lib/ingestion/tagger.ts` — exports `scoreRelevance(input)` and `assignTags(input)`.

---

## Scorer contract

```ts
interface RelevanceInput {
  title: string
  abstract: string | null
}

interface RelevanceResult {
  score: number // 0.0–1.0 (cap 1.0, floor 0.0)
  tags: string[] // subset of TAG_ORDER, deterministic order
}
```

- Pure function. Same input → same output.
- Case-insensitive. No stemming — `"forgeries"` must NOT trigger `"forgery detection"`.
- Whole-phrase match (substring on lowercased string). `"copy-move"` matches `"Copy-Move Detection"` but not `"copymove"`.
- A single keyword matched in both title and abstract counts **once**, at the title weight.

---

## Weight table

| Tier   | Title weight | Abstract weight | Keywords                                                                                                                                                                                                                                                    |
| ------ | ------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High   | +0.4         | +0.2            | forgery detection · tamper detection · manipulation detection · image forensics · forgery localization · splicing detection · copy-move detection · inpainting detection · document authentication · document verification · ID document · passport forgery |
| Medium | +0.2         | +0.1            | image integrity · deepfake detection · face swap detection · GAN detection · AI-generated image · pixel-level segmentation · anomaly localization · passive authentication · PRNU · noise analysis · watermark detection                                    |
| Low    | 0            | +0.05           | image authenticity · digital forensics · image manipulation · steganalysis                                                                                                                                                                                  |

- **Score cap:** 1.0.
- **Default-feed threshold:** 0.2. Papers with score < 0.2 are **stored** but hidden from the default feed. Enforced at query time, not at the scorer.

---

## Tag vocabulary (12 tags)

Canonical order (returned by `assignTags` in this order):

| #   | Tag                 | Trigger keywords (case-insensitive substring)                       |
| --- | ------------------- | ------------------------------------------------------------------- |
| 1   | `copy-move`         | copy-move · copy move · duplication detection                       |
| 2   | `splicing`          | splicing · splice · composite image                                 |
| 3   | `inpainting`        | inpainting · removal detection · object removal                     |
| 4   | `localization`      | localization · segmentation mask · pixel-level · region-level       |
| 5   | `document`          | document · passport · ID card · driving license · national ID · OVD |
| 6   | `text-manipulation` | text region · OCR tampering · text forgery · altered text           |
| 7   | `deepfake`          | deepfake · face swap · face manipulation · face forgery             |
| 8   | `gan-detection`     | GAN detection · AI-generated · synthetic image · generative         |
| 9   | `passive-auth`      | passive authentication · no watermark · blind detection             |
| 10  | `forensics`         | image forensics · digital forensics · PRNU · noise analysis         |
| 11  | `transformer`       | transformer · ViT · attention-based                                 |
| 12  | `diffusion`         | diffusion model · DDPM                                              |

Tag triggers may match either title OR abstract. Each tag is added at most once, even if multiple triggers fire.

---

## Determinism & versioning

- `TAG_ORDER` export in `tagger.ts` is the canonical order. Do not reorder without also bumping a scorer version.
- Keep keyword lists **sorted or grouped** in source for readability — the scorer does not depend on array order.
- **When the keyword list or weights change**: bump a `SCORER_VERSION` constant (to be added in a future iteration) and run a one-off backfill to re-score existing papers. Until that constant exists, treat any edit to this skill or `tagger.ts` as a reason to run a manual rescore.

---

## Testing

Unit tests live at `tests/unit/relevance.test.ts`. Required cases:

- Empty input → score 0, tags [].
- Each tier contributes its exact weight.
- Title + abstract hit for same keyword → counted once (title weight).
- Multiple distinct keywords sum correctly.
- Cap at 1.0.
- Case-insensitivity.
- No stemming (`forgeries` ≠ `forgery detection`).
- Null abstract handled safely.
- Deterministic repeat.
- Tag assignment returns canonical order.
- Tag dedup (multiple triggers → one tag).

Coverage target: ≥80% on `tagger.ts`.

---

## When to re-score existing papers

Run a one-off migration (`scripts/backfill-relevance.ts` — create when first needed) in any of these cases:

1. Keyword list edited (add/remove/reweight).
2. Tag vocabulary or triggers changed.
3. Score cap or formula changed.
4. A new adapter backfills historical papers from a source that wasn't active before.

The backfill should stream through `papers` in batches of ~1000, recompute `relevanceScore` and `relevanceTags`, and write back. It must NOT touch any other column.

---

## Do not

- Do not use LLMs or embeddings for relevance scoring in Phase A. The simple keyword scorer is the contract. (Phase B may layer a reranker, but that's separate.)
- Do not add stemming, lemmatisation, or fuzzy match — it produces false positives that are hard to audit.
- Do not silently drop papers below the threshold. Store everything; filter at query time.
