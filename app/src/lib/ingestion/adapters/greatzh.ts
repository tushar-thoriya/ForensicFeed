import type { Adapter, AdapterFetchOptions } from '@/lib/ingestion/types'
import type { NormalisedPaper, PaperDomain } from '@/types/paper'
import { extractCodeUrl } from '@/lib/ingestion/code-url'
import { extractArxivIdFromUrl } from '@/lib/ingestion/arxiv-id'
import { sanitiseExternalUrl } from '@/lib/security/url'

const README_URL = 'https://raw.githubusercontent.com/greatzh/papers/master/README.md'
const GREATZH_FETCH_TIMEOUT_MS = 30_000

// github.com/greatzh/papers is a hand-curated, actively-maintained paper list.
// It also tracks generic-CV categories (Backbone, Object Detection, …) that
// are out of scope for this tracker. Only headings in this map are ingested;
// each maps to the domain (feed tab) its papers belong to — forgery sections
// to 'forgery', the face/video manipulation sections to 'deepfake'. The domain
// travels as a `domainHint` and is a strong prior, but classifyDomain still
// lets a forgery-core keyword override a 'deepfake' hint (see domain.ts).
//
// Matching is heading-level aware: once a mapped heading is seen, any deeper
// heading (e.g. a year-titled subsection) inherits its domain until a heading
// at the same-or-shallower level is reached.
export const SECTION_DOMAIN: ReadonlyMap<string, PaperDomain> = new Map(
  (
    [
      ['Image Tampering', 'forgery'],
      ['AIGC', 'forgery'],
      ['Image Editing', 'forgery'],
      ['CNN-synthesized', 'forgery'],
      ['Image Splicing', 'forgery'],
      ['Image Harmonization', 'forgery'],
      ['Copy Move', 'forgery'],
      ['Image Inpainting', 'forgery'],
      ['Tamper Text in Detection', 'forgery'],
      ['Face Forgery', 'deepfake'],
      ['Video Forgery', 'deepfake'],
    ] as const
  ).map(([section, domain]) => [section.toLowerCase(), domain]),
)

// Known venue-badge/legacy-paren abbreviations, used only to decide whether a
// resolved venue reads as a conference or a journal in the UI's venue-type
// filter. Best-effort — an unrecognised abbreviation defaults to 'conference'
// since the vast majority of entries in this repo are top-tier conferences.
const JOURNAL_VENUES = new Set([
  'tifs',
  'pr',
  'kbs',
  'neurocomputing',
  'tcsvt',
  'tomm',
  'tmm',
  'tdsc',
  'spl',
  'pami',
  'ijcv',
  'tip',
])

const HEADING_RE = /^(#{2,4})\s+(.+?)\s*$/
// Bullets with no `[ ]`/`[x]` checkbox (plain `* Title` / `- Title`) are
// intentionally not matched — this repo consistently uses task-list bullets
// for paper entries, and a bare bullet is more likely to be prose/metadata.
const BULLET_RE = /^[*-]\s*\[[ xX]\]\s*(.+)$/
const DOC_LINK_TITLE_RE = /^\[([^\]]+)\]\([^)]*\)/
const TITLE_CUTOFF_RE = /\[!?\[|\(_|_\(|\*\*\\?\[/
const BADGE_VENUE_RE = /badge\/([A-Za-z0-9.]+)_(?:'|%27)(\d{2})-/
const LEGACY_VENUE_RE = /\(_([A-Za-z][A-Za-z0-9&,. ]*?)\s+'(\d{2})_\)/

function extractTitle(entry: string): string {
  const docLinkMatch = entry.match(DOC_LINK_TITLE_RE)
  if (docLinkMatch && !entry.startsWith('[![')) {
    return docLinkMatch[1]!.trim()
  }
  const cutoff = entry.search(TITLE_CUTOFF_RE)
  const title = cutoff === -1 ? entry : entry.slice(0, cutoff)
  return title.trim()
}

interface VenueInfo {
  venue: string
  venueType: 'arxiv' | 'conference' | 'journal' | 'workshop' | 'preprint'
}

function venueTypeForSlug(slug: string): VenueInfo['venueType'] {
  return JOURNAL_VENUES.has(slug.toLowerCase()) ? 'journal' : 'conference'
}

function extractVenue(entry: string): VenueInfo {
  const badgeMatch = entry.match(BADGE_VENUE_RE)
  if (badgeMatch) {
    const slug = badgeMatch[1]!
    const yy = badgeMatch[2]!
    if (slug.toLowerCase() === 'arxiv') return { venue: 'arXiv', venueType: 'arxiv' }
    return { venue: `${slug} 20${yy}`, venueType: venueTypeForSlug(slug) }
  }
  const legacyMatch = entry.match(LEGACY_VENUE_RE)
  if (legacyMatch) {
    const slug = legacyMatch[1]!.trim()
    const yy = legacyMatch[2]!
    return { venue: `${slug} 20${yy}`, venueType: venueTypeForSlug(slug) }
  }
  return { venue: 'arXiv', venueType: 'arxiv' }
}

function extractArxivId(entry: string): string | null {
  const urlMatch = entry.match(/https?:\/\/[^\s)]+/g)
  if (!urlMatch) return null
  for (const url of urlMatch) {
    const id = extractArxivIdFromUrl(url)
    if (id) return id
  }
  return null
}

// arXiv ids are YYMM.NNNNN — this is a more reliable year/month source than
// trying to parse every venue badge variant in the file.
function dateFromArxivId(arxivId: string): { year: number; publishedDate: Date } | null {
  const match = arxivId.match(/^(\d{2})(\d{2})\./)
  if (!match) return null
  const yy = Number(match[1])
  const mm = Number(match[2])
  if (mm < 1 || mm > 12) return null
  const year = 2000 + yy
  return { year, publishedDate: new Date(Date.UTC(year, mm - 1, 1)) }
}

function domainForHeading(heading: string): PaperDomain | undefined {
  return SECTION_DOMAIN.get(heading.toLowerCase())
}

export function parseGreatzhReadme(markdown: string): NormalisedPaper[] {
  if (!markdown) return []

  const lines = markdown.split('\n')
  const seen = new Map<string, NormalisedPaper>()
  let currentDomain: PaperDomain | null = null
  let allowedAtLevel = 0
  let currentHeading = ''

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE)
    if (headingMatch) {
      const level = headingMatch[1]!.length
      currentHeading = headingMatch[2]!
      const mapped = domainForHeading(currentHeading)
      if (mapped) {
        currentDomain = mapped
        allowedAtLevel = level
      } else if (currentDomain === null || level <= allowedAtLevel) {
        // Not a mapped heading itself, and either nothing was in scope yet
        // or this heading is at/above the level that opened the current
        // section — i.e. we've left the in-scope subtree.
        currentDomain = null
      }
      // else: deeper heading than the in-scope ancestor (e.g. a year
      // subsection) — inherit its domain.
      continue
    }

    if (currentDomain === null) continue

    const bulletMatch = line.match(BULLET_RE)
    if (!bulletMatch) continue

    const entry = bulletMatch[1]!.trim()
    const arxivId = extractArxivId(entry)
    if (!arxivId) continue

    const dated = dateFromArxivId(arxivId)
    if (!dated) continue

    const title = extractTitle(entry)
    if (!title) continue

    if (seen.has(arxivId)) continue

    const { venue, venueType } = extractVenue(entry)

    seen.set(arxivId, {
      title,
      authors: [],
      abstract: null,
      arxivId,
      doi: null,
      venue,
      venueType,
      year: dated.year,
      publishedDate: dated.publishedDate,
      updatedDate: null,
      pdfUrl: sanitiseExternalUrl(`https://arxiv.org/pdf/${arxivId}`),
      codeUrl: sanitiseExternalUrl(extractCodeUrl(entry)),
      citationCount: null,
      primarySource: 'greatzh_repo',
      rawMetadata: { section: currentHeading },
      domainHint: currentDomain,
    })
  }

  return Array.from(seen.values())
}

export const greatzhAdapter: Adapter = {
  source: 'greatzh_repo',
  // `since` is intentionally unused: publishedDate is month-granularity
  // (derived from the arXiv id, see dateFromArxivId) and pinned to day 1, so
  // a rolling `since` cutoff would permanently exclude a paper the curator
  // adds to the README weeks after its arXiv month — the exclusion would
  // never self-correct on later runs. Mirrors cvf.ts: always do a full
  // sweep and let the DB upsert (arxivId dedup) handle idempotency.
  async fetch(_options: AdapterFetchOptions): Promise<NormalisedPaper[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GREATZH_FETCH_TIMEOUT_MS)

    let markdown: string
    try {
      const response = await fetch(README_URL, {
        headers: {
          Accept: 'text/plain',
          'User-Agent':
            'forensicfeed-research-tracker (+https://github.com/tushar-thoriya/ForensicFeed)',
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`greatzh/papers README returned ${response.status}: ${response.statusText}`)
      }
      markdown = await response.text()
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`greatzh/papers README fetch timed out after ${GREATZH_FETCH_TIMEOUT_MS}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    return parseGreatzhReadme(markdown)
  },
}
