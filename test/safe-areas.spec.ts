import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// Safe areas are CSS and markup, not behavior: happy-dom does not evaluate
// scoped styles and no test runner has a notch, so these read the sources as
// text. The failure they exist to catch is silent — drop viewport-fit and the
// insets quietly become 0px again, which looks perfectly fine in a browser.
import appVue from '../src/App.vue?raw'
import aboutHtml from '../about.html?raw'
import privacyHtml from '../privacy.html?raw'
import indexHtml from '../index.html?raw'

// Read off disk rather than imported: Vitest leaves CSS unprocessed, so
// `../src/style.css?raw` arrives as an empty string and every token assertion
// below would pass by saying nothing. Anchored on the project root vitest runs
// in, as offline-parity.spec.ts is — happy-dom hands the suite an http
// `import.meta.url`.
const tokens = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8')

const INSETS = ['top', 'right', 'bottom', 'left'] as const

/** The block that opens at the first `{` at or after `from`, braces matched. */
function braceBlock(css: string, from: number): string {
  const open = css.indexOf('{', from)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open, i + 1)
  }
  return ''
}

const viewportContent = (html: string) =>
  html.match(/<meta\s[^>]*name="viewport"[^>]*>/is)?.[0] ?? ''

// The .page rule, from its brace to the matching close — every page has one
// and they are all flat, so a non-greedy run to the first `}` is enough.
const pageRule = (source: string) => source.match(/\.page\s*\{[^}]*\}/)?.[0] ?? ''

const pages = [
  { name: 'index.html', source: indexHtml },
  { name: 'about.html', source: aboutHtml },
  { name: 'privacy.html', source: privacyHtml },
] as const

describe('safe areas', () => {
  it.each(pages)('$name asks for the whole screen', ({ source }) => {
    // Without viewport-fit=cover WebKit letterboxes the page inside the safe
    // area and every env(safe-area-inset-*) resolves to zero.
    expect(viewportContent(source)).toMatch(/viewport-fit=\s*cover/)
  })

  it.each(INSETS)('exposes the %s inset as a token', inset => {
    expect(tokens).toContain(
      `--hb-safe-${inset}: env(safe-area-inset-${inset}, 0px);`,
    )
  })

  it('keeps the insets out of the dark theme', () => {
    // They are device geometry. Re-declaring them under prefers-color-scheme
    // would be the first --hb-* token whose value depended on the theme by
    // accident rather than by design.
    const at = tokens.indexOf('@media (prefers-color-scheme: dark)')
    // Assert the anchor before slicing from it: indexOf returns -1 when the
    // block is renamed or gone, and slice(-1) would hand the check below a
    // single character to find nothing in — a pass that means nothing.
    expect(at).toBeGreaterThan(-1)
    // The dark block itself, brace-matched. Slicing to the end of the file
    // instead would fail any later rule that merely *reads* an inset, which
    // the status-bar strip below does — the claim here is narrower than that:
    // the dark theme does not re-declare them.
    const dark = braceBlock(tokens, at)
    expect(dark).not.toBe('')
    expect(dark).not.toContain('--hb-safe-')
  })

  const layoutSources = [
    { name: 'App.vue', source: appVue },
    { name: 'about.html', source: aboutHtml },
    { name: 'privacy.html', source: privacyHtml },
  ] as const

  const layouts = layoutSources.map(({ name, source }) => ({ name, rule: pageRule(source) }))

  it.each(layoutSources)('$name declares .page exactly once', ({ source }) => {
    // pageRule takes the first `.page {` it finds, which is only the layout
    // rule while there is exactly one. HB-43 added a media query to App.vue
    // without restating .page; this is the guard that keeps that true, and
    // keeps the assertions below from silently checking an override.
    expect(source.match(/\.page\s*\{/g) ?? []).toHaveLength(1)
  })

  it.each(layouts)('$name pads .page by all four insets', ({ rule }) => {
    for (const inset of INSETS) {
      expect(rule).toContain(`var(--hb-safe-${inset})`)
    }
  })

  describe('status-bar backdrop (UX-14)', () => {
    // Genuinely brace-matched, unlike pageRule's run to the first `}` — the
    // helper is already here for the dark block, and a rule that later grows
    // an @supports for backdrop-filter should not quietly read as half a rule.
    const stripAt = tokens.indexOf('.page::before')
    const strip = stripAt === -1 ? '' : braceBlock(tokens, stripAt)

    it('frosts a strip the height of the top inset', () => {
      expect(strip).toContain('height: var(--hb-safe-top);')
      expect(strip).toContain('position: fixed;')
      expect(strip).toContain('backdrop-filter:')
      // ADR-0003 floors at iOS 15.0, where only the prefixed property exists.
      expect(strip).toContain('-webkit-backdrop-filter:')
      // The clock is the OS's to tap, and the strip is not a control.
      expect(strip).toContain('pointer-events: none;')
    })

    it('lives in style.css so both pages get exactly one', () => {
      // index.html renders App.vue and about.html links this stylesheet; both
      // wrap everything in .page. Declared per-page it would drift.
      expect(tokens.match(/\.page::before/g) ?? []).toHaveLength(1)
      for (const { source } of layoutSources) {
        expect(source).not.toContain('.page::before')
      }
    })

    it('needs no media query and no platform check', () => {
      // --hb-safe-top is 0px on the website, on an iPad and on any phone
      // without a notch, so the strip is zero-height wherever it is unwanted.
      const at = tokens.indexOf('.page::before')
      expect(at).toBeGreaterThan(-1)
      const before = tokens.slice(0, at)
      // Brace depth at the rule: 0 means top level, and the only thing that
      // nests a rule in this file is a media query.
      const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length
      expect(depth).toBe(0)
    })

    it('tints from a token that follows the theme', () => {
      // Opaque would leave the blur nothing to do; a hard-coded rgba would
      // leave the light page's strip on the dark theme.
      expect(strip).toContain('background: var(--hb-scrim);')
      const at = tokens.indexOf('@media (prefers-color-scheme: dark)')
      expect(tokens.slice(at)).toContain('--hb-scrim:')
    })
  })

  it.each(layouts)('$name keeps a vh fallback under the dvh height', ({ rule }) => {
    // ADR-0003 puts the floor at iOS 15.0; dvh arrived in Safari 15.4. Order
    // matters — the older parser drops the line it cannot read and keeps
    // whatever came before it.
    expect(rule.indexOf('100vh')).toBeGreaterThan(-1)
    expect(rule.indexOf('100dvh')).toBeGreaterThan(rule.indexOf('100vh'))
  })
})
