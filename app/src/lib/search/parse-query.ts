// Defensive upper bound. 200 chars is far longer than any sensible search;
// past this we truncate silently so a pathological paste cannot make us send
// megabytes to websearch_to_tsquery.
export const MAX_SEARCH_QUERY_LENGTH = 200

export function parseSearchQuery(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null

  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return null

  if (collapsed.length > MAX_SEARCH_QUERY_LENGTH) {
    return collapsed.slice(0, MAX_SEARCH_QUERY_LENGTH)
  }
  return collapsed
}
