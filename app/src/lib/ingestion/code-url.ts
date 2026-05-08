// Extract a GitHub-hosted code URL from free text (titles, abstracts, summaries).
//
// Many image-forgery papers embed a repo URL in their abstract: "Code is
// available at https://github.com/foo/bar". This utility pulls the first
// plausible repo URL out of such text so adapters can populate `codeUrl`
// without an extra API roundtrip.
//
// Scope: github.com only — by far the most common host in this domain.
// gitlab/bitbucket repos are rare enough in forgery research that supporting
// them now would mostly add noise.

const GITHUB_REPO_RE =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+)/i

const FORBIDDEN_OWNERS = new Set([
  'orgs',
  'topics',
  'search',
  'marketplace',
  'sponsors',
  'apps',
  'features',
  'pricing',
  'about',
])

// Trim sentence punctuation that the regex slurped at the tail of the repo name.
function trimTrailingPunctuation(repo: string): string {
  return repo.replace(/[).,;:!?'"]+$/, '')
}

export function extractCodeUrl(text: string | null | undefined): string | null {
  if (!text) return null

  const match = text.match(GITHUB_REPO_RE)
  if (!match) return null

  const owner = match[1]
  const rawRepo = match[2]
  if (!owner || !rawRepo) return null
  if (FORBIDDEN_OWNERS.has(owner.toLowerCase())) return null

  // Strip trailing sentence punctuation, then a trailing `.git`.
  const cleanedRepo = trimTrailingPunctuation(rawRepo).replace(/\.git$/i, '')
  if (!cleanedRepo) return null
  return `https://github.com/${owner}/${cleanedRepo}`
}
