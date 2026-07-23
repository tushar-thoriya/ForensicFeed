import type { PaperSource } from '@/types/paper'

const GREATZH_REPO_URL = 'https://github.com/greatzh/papers'

// Approximates GitHub's heading-anchor slug algorithm closely enough for the
// section names this adapter actually produces (see ALLOWED_SECTIONS in
// adapters/greatzh.ts) — lowercase, spaces to hyphens, strip punctuation
// other than hyphens.
function githubHeadingSlug(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

export interface SourceBadge {
  label: string
  url: string
}

// Only greatzh papers get a source badge. Every other adapter's `pdfUrl`
// already points at the canonical source (arXiv, CVF proceedings, etc.), so
// a separate "source" link would be redundant there. greatzh is different:
// `pdfUrl` points at arXiv, but the paper was actually surfaced via the
// curated GitHub list, and that provenance is worth linking back to.
export function getSourceBadge(
  primarySource: PaperSource,
  rawMetadata: Record<string, unknown>,
): SourceBadge | null {
  if (primarySource !== 'greatzh_repo') return null
  const section = typeof rawMetadata.section === 'string' ? rawMetadata.section : null
  const url = section ? `${GREATZH_REPO_URL}#${githubHeadingSlug(section)}` : GREATZH_REPO_URL
  return { label: 'greatzh/papers', url }
}
