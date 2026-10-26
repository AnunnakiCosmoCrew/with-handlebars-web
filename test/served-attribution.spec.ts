// @vitest-environment node
import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import notFoundHtml from '../404.html?raw'
import aboutHtml from '../about.html?raw'
import indexHtml from '../index.html?raw'
import privacyHtml from '../privacy.html?raw'
import config from '../vite.config'
import { BOARDS, boardPath } from '../src/lib/board-path'
import { boardPage, hubPages, renderBoardPage, renderHubPage } from '../tools/board-pages-plugin'

// Who owns the software has to be in the HTML the server sends, not only in
// what the bundle later draws: the reviewer this line exists for reads the page
// and goes no further, and a fetch or a view-source never runs the bundle.
// about.html and privacy.html are written HTML and carry the line in their
// footers. index.html is a shell — the room's footer is rendered by App.vue —
// so its copy lives in the <noscript> rendering and in the JSON-LD, which is
// what a machine reading the page is looking at anyway.
const LINE = '© 2026 CosmoCrew — a brand of'
const LINK = '<a href="https://luvita.tr/" rel="noopener">Luvita Teknoloji Ltd. Şti.</a>'

const pages = {
  '404.html': notFoundHtml,
  'about.html': aboutHtml,
  'index.html': indexHtml,
  'privacy.html': privacyHtml,
}

describe('the attribution in the served HTML', () => {
  // Keyed off the build inputs rather than a hand-kept list: a new page that
  // ships has to be added here before the suite passes, which is the whole
  // point of a rule that says every public page carries the line.
  it('covers every page that ships', () => {
    const input = config.build?.rollupOptions?.input as Record<string, string>
    expect(Object.values(input).map(p => basename(p)).sort()).toEqual(Object.keys(pages).sort())
  })

  for (const [page, html] of Object.entries(pages)) {
    it(`${page} names the company, with the entity as the link`, () => {
      expect(html).toContain(LINE)
      // The name without the link does not satisfy ADR 0001 — a bare domain
      // detached from the sentence is what failed to register on umayconnect.org.
      expect(html).toContain(LINK)
    })
  }

  it('names the company as publisher and copyright holder in the JSON-LD', () => {
    // 'null' rather than '' as the fallback: a page that lost its JSON-LD
    // should fail on the assertion below, not on a parse error.
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? 'null'
    const ld = JSON.parse(block)
    expect(ld).not.toBeNull()
    for (const role of ['publisher', 'copyrightHolder'] as const) {
      expect(ld[role]).toMatchObject({
        '@type': 'Organization',
        name: 'Luvita Teknoloji Ltd. Şti.',
        url: 'https://luvita.tr/',
      })
    }
    // The brand made it, the company owns it — ADR 0001 keeps both, and
    // replacing the creator with the company would be the rebrand it rules out.
    // The brand is CosmoCrew: 'AnunnakiCosmoCrew' is the GitHub org, and naming
    // it here is what left the App Store listing and the About page disagreeing.
    expect(ld.creator).toMatchObject({ name: 'CosmoCrew' })
  })

  // The listing's Support URL is the About page, and the listing copy closes on
  // "From CosmoCrew" — a reviewer reads both in one sitting, so the org's name
  // must not surface as the maker anywhere a reader lands. The spaced form is
  // the one to catch: 'AnunnakiCosmoCrew' unspaced is a real GitHub org and
  // stays in the repository URLs.
  for (const [page, html] of Object.entries(pages)) {
    it(`${page} names the brand, never the GitHub org, as the maker`, () => {
      expect(html).not.toContain('Anunnaki Cosmo Crew')
      expect(html).not.toContain('anunnakicosmocrew.github.io')
    })
  }
})

// The board pages (HB-153) are generated from the built index.html rather than
// listed as build inputs, so they are rendered here from the same template the
// build uses, all 432 of them: one that lost the line would be a page a
// reviewer lands on with no owner named.
describe('the attribution in the generated board pages', () => {
  const generated = BOARDS.map(b => [boardPath(b)!, renderBoardPage(indexHtml, boardPage(b))] as const)

  it('covers every tier-1 board', () => {
    expect(generated).toHaveLength(432)
  })

  it('names the company, with the entity as the link, on every page', () => {
    for (const [path, html] of generated) {
      expect(html, path).toContain(LINE)
      expect(html, path).toContain(LINK)
      expect(html, path).not.toContain('Anunnaki Cosmo Crew')
    }
  })

  it('names the company as publisher and copyright holder in every JSON-LD', () => {
    for (const [path, html] of generated) {
      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? 'null')
      for (const role of ['publisher', 'copyrightHolder'] as const) {
        expect(ld?.[role], path).toMatchObject({ name: 'Luvita Teknoloji Ltd. Şti.', url: 'https://luvita.tr/' })
      }
      expect(ld.creator, path).toMatchObject({ name: 'CosmoCrew' })
    }
  })
})

// The hubs (HB-154) are documents of their own, so they carry the line in a footer
// rather than a <noscript> block.
describe('the attribution in the generated hub pages', () => {
  it('names the company, with the entity as the link, and the company in the JSON-LD, on every hub', () => {
    const hubs = hubPages()
    expect(hubs.length).toBeGreaterThan(0)
    for (const hub of hubs) {
      const html = renderHubPage(indexHtml, hub)
      expect(html, hub.path).toContain(LINE)
      expect(html, hub.path).toContain(LINK)
      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? 'null')
      for (const role of ['publisher', 'copyrightHolder'] as const) {
        expect(ld?.[role], hub.path).toMatchObject({ name: 'Luvita Teknoloji Ltd. Şti.', url: 'https://luvita.tr/' })
      }
    }
  })
})
