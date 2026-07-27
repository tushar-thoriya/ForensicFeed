// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  abstractSnippetExpr,
  FEED_ABSTRACT_SNIPPET_CHARS,
} from '@/lib/db/queries/list-papers-query'

const dialect = new PgDialect()

function compile(maxChars?: number) {
  return dialect.sqlToQuery(
    maxChars === undefined ? abstractSnippetExpr() : abstractSnippetExpr(maxChars),
  )
}

describe('abstractSnippetExpr', () => {
  it('budget covers the 3 clamped lines at the 860px content cap', () => {
    // feed.css clamps .paper-card-abstract to 3 lines; ~100 chars/line at
    // --content-max. The budget must exceed that so nothing visible is lost.
    expect(FEED_ABSTRACT_SNIPPET_CHARS).toBeGreaterThanOrEqual(300)
  })

  it('passes short abstracts through untouched', () => {
    const { sql } = compile()
    expect(sql).toMatch(/when length\("papers"."abstract"\) <= \$\d+ then "papers"."abstract"/)
  })

  it('preserves null rather than emitting an empty string', () => {
    const { sql } = compile()
    expect(sql).toMatch(/when "papers"."abstract" is null then null/)
  })

  it('truncates to the budget and marks the cut with an ellipsis', () => {
    const { sql, params } = compile()
    expect(sql).toMatch(/left\("papers"."abstract", \$\d+\)/)
    expect(sql).toContain("|| '…'")
    expect(params).toContain(FEED_ABSTRACT_SNIPPET_CHARS)
  })

  it('drops the trailing partial word so the snippet ends cleanly', () => {
    const { sql } = compile()
    // A literal backslash must survive into SQL — `\s` in a JS template
    // literal collapses to a bare `s`, which would match the letter instead
    // of whitespace and silently truncate mid-word.
    expect(sql).toContain('\\s+\\S*$')
  })

  it('binds the budget as a parameter rather than inlining it', () => {
    const { params } = compile(120)
    expect(params).toContain(120)
  })
})
