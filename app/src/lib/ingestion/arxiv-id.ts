// Extract an arXiv ID from a URL pointing at an abs/pdf page. Shared by
// scraping-based adapters (CVF, greatzh) that only get a plain link, unlike
// the arxiv.ts adapter which parses the ID directly out of Atom XML.
const ARXIV_URL_RE = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i

export function extractArxivIdFromUrl(url: string): string | null {
  const match = url.match(ARXIV_URL_RE)
  return match ? match[1]! : null
}
