const S2_FETCH_TIMEOUT_MS = 30_000
// An unapproved key shares the anonymous pool, where sustained 429s are normal.
// Five attempts at a 2s base gives ~30s of patience per request (2+4+8+16),
// which empirically clears contention that a 1s base does not.
const S2_MAX_ATTEMPTS = 5
const S2_DEFAULT_BACKOFF_MS = 2_000
const S2_MAX_RETRY_AFTER_MS = 60_000

export const S2_BASE = 'https://api.semanticscholar.org/graph/v1'

export interface S2RequestOptions {
  apiKey?: string | null
  // Base delay for both inter-request spacing and retry backoff. Tests pass 0
  // to run instantly; production leaves it at S2_DEFAULT_BACKOFF_MS.
  backoffMs?: number
  body?: unknown
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// S2 throttles aggressively: an unapproved key shares the anonymous pool and
// 429s on a large fraction of calls. A single 429 must not sink a whole run.
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

// S2 sometimes states how long to wait. Honour it over our own backoff curve,
// but never let an upstream header park a job for minutes.
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return Math.min(seconds * 1000, S2_MAX_RETRY_AFTER_MS)
}

function toError(error: unknown): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error(`Semantic Scholar API timed out after ${S2_FETCH_TIMEOUT_MS}ms`)
  }
  if (error instanceof Error) return error
  return new Error('unknown Semantic Scholar error')
}

async function fetchWithTimeout(url: string, options: S2RequestOptions): Promise<Response> {
  const hasBody = options.body !== undefined
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.apiKey) headers['x-api-key'] = options.apiKey
  if (hasBody) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), S2_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: hasBody ? 'POST' : 'GET',
      headers,
      signal: controller.signal,
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function s2Request(url: string, options: S2RequestOptions = {}): Promise<unknown> {
  const backoffMs = options.backoffMs ?? S2_DEFAULT_BACKOFF_MS
  let lastError = new Error('Semantic Scholar request never ran')
  let waitMs = 0

  for (let attempt = 0; attempt < S2_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(waitMs || backoffMs * 2 ** (attempt - 1))

    let response: Response
    try {
      response = await fetchWithTimeout(url, options)
    } catch (error: unknown) {
      lastError = toError(error)
      waitMs = 0
      continue
    }

    if (response.ok) return (await response.json()) as unknown

    const statusError = new Error(`Semantic Scholar API returned ${response.status}`)
    // 4xx other than 429 means the request itself is wrong — retrying is waste.
    if (!isRetryable(response.status)) throw statusError
    lastError = statusError
    // Only honour Retry-After when the caller hasn't pinned backoff to 0 (tests).
    waitMs = backoffMs > 0 ? (retryAfterMs(response) ?? 0) : 0
  }

  throw lastError
}
