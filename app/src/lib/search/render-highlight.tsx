import { Fragment, type ReactNode } from 'react'

// ASCII control chars STX (\x02) and ETX (\x03) are structurally impossible
// in any PDF-extracted, XML-parsed, or JSON-parsed paper abstract.
// ts_headline is configured with StartSel=\x02,StopSel=\x03 in the list
// query SELECT (papers.ts).
//
// Match a START..END pair non-greedily. Lone START or lone END outside any
// pair are stripped by stripLoneSentinels — defensive: ts_headline always
// balances, but a corrupted DB row should degrade to plain text rather
// than crash the render.
const HIGHLIGHT_PATTERN = /\x02([^\x03]*)\x03/g

export function renderHighlight(text: string | null | undefined): ReactNode {
  if (!text) return null

  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0

  for (const match of text.matchAll(HIGHLIGHT_PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor) {
      nodes.push(<Fragment key={key++}>{stripLoneSentinels(text.slice(cursor, start))}</Fragment>)
    }
    nodes.push(<mark key={key++}>{match[1]}</mark>)
    cursor = start + match[0].length
  }
  if (cursor < text.length) {
    nodes.push(<Fragment key={key++}>{stripLoneSentinels(text.slice(cursor))}</Fragment>)
  }

  return <>{nodes}</>
}

function stripLoneSentinels(s: string): string {
  return s.replace(/[\x02\x03]/g, '')
}
