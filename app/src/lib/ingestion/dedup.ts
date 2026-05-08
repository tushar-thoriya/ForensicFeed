import { createHash } from 'node:crypto'

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim()
}

export function titleHash(title: string): string {
  return createHash('sha256').update(normaliseTitle(title)).digest('hex')
}

export interface DedupKey {
  arxivId: string | null
  doi: string | null
  titleHash: string
}

export function dedupKeyFor(input: {
  title: string
  arxivId?: string | null
  doi?: string | null
}): DedupKey {
  return {
    arxivId: input.arxivId ?? null,
    doi: input.doi ?? null,
    titleHash: titleHash(input.title),
  }
}
