// Allow only http(s) URLs through to the database / DOM. External APIs
// (Semantic Scholar's openAccessPdf, future enrichment sources) are not
// trusted to return safe schemes — a `javascript:` href stored as `pdfUrl`
// would render as an executable anchor in the feed.
const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

export function sanitiseExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}
