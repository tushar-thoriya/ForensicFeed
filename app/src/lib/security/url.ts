// Allow only http(s) URLs through to the database / DOM. External APIs
// (Semantic Scholar's openAccessPdf, future enrichment sources) are not
// trusted to return safe schemes — a `javascript:` href stored as `pdfUrl`
// would render as an executable anchor in the feed.
const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

// Block private/internal hosts so a poisoned upstream cannot redirect the
// ingest worker into an SSRF — most pressing risk: the cloud metadata endpoint
// (169.254.169.254) which leaks IAM credentials in many providers.
const PRIVATE_HOST_RE =
  /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fc00:|fe80:|\[::1\]$|\[fc00:|\[fe80:)/i

export function sanitiseExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null
    if (PRIVATE_HOST_RE.test(parsed.hostname)) return null
    return parsed.toString()
  } catch {
    return null
  }
}
