// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { renderHighlight } from '@/lib/search/render-highlight'

function renderToString(node: React.ReactNode): string {
  const { container } = render(<div>{node}</div>)
  return container.firstChild instanceof HTMLElement ? container.firstChild.innerHTML : ''
}

describe('renderHighlight', () => {
  it('returns empty fragment for null', () => {
    expect(renderToString(renderHighlight(null))).toBe('')
  })

  it('returns empty fragment for empty string', () => {
    expect(renderToString(renderHighlight(''))).toBe('')
  })

  it('returns plain text when no sentinels present', () => {
    expect(renderToString(renderHighlight('foo bar baz'))).toBe('foo bar baz')
  })

  it('wraps a single highlight in <mark>', () => {
    expect(renderToString(renderHighlight('foo \x02bar\x03 baz'))).toBe(
      'foo <mark>bar</mark> baz',
    )
  })

  it('wraps multiple highlights independently', () => {
    expect(renderToString(renderHighlight('a \x02b\x03 c \x02d\x03'))).toBe(
      'a <mark>b</mark> c <mark>d</mark>',
    )
  })

  it('handles sentinel at start of input', () => {
    expect(renderToString(renderHighlight('\x02x\x03 y'))).toBe('<mark>x</mark> y')
  })

  it('handles sentinel at end of input', () => {
    expect(renderToString(renderHighlight('x \x02y\x03'))).toBe('x <mark>y</mark>')
  })

  it('strips lone opening sentinel without crashing', () => {
    // Defensive: should never happen because ts_headline always balances,
    // but if a malformed value arrives we degrade to plain text instead
    // of throwing.
    expect(() => renderToString(renderHighlight('foo \x02bar'))).not.toThrow()
    expect(renderToString(renderHighlight('foo \x02bar'))).toBe('foo bar')
  })

  it('strips lone closing sentinel without crashing', () => {
    expect(() => renderToString(renderHighlight('foo bar\x03'))).not.toThrow()
    expect(renderToString(renderHighlight('foo bar\x03'))).toBe('foo bar')
  })

  it('handles back-to-back highlights with no separator', () => {
    expect(renderToString(renderHighlight('\x02a\x03\x02b\x03'))).toBe(
      '<mark>a</mark><mark>b</mark>',
    )
  })

  it('does not introduce HTML for special characters in plain text', () => {
    // Renders < > & as text, not as HTML — confirms we are NOT using
    // dangerouslySetInnerHTML.
    const out = renderToString(renderHighlight('foo <script> &amp; \x02bar\x03'))
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('&amp;amp;')
    expect(out).toContain('<mark>bar</mark>')
  })
})
