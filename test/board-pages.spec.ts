// @vitest-environment node
import { resolve } from 'node:path'
import { build } from 'vite'
import type { OutputAsset, RollupOutput } from 'rollup'
import { beforeAll, describe, expect, it } from 'vitest'
import { BOARDS, boardPath } from '../src/lib/board-path'
import { boardFile, boardPage, cardFile, hubFile, hubPages, renderSitemap } from '../tools/board-pages-plugin'
import entityCopy from '../tools/boards/entity-copy.json'

/**
 * HB-153. What `npm run build` actually emits for the board pages: the real
 * plugin chain, built in memory. A page here is what Cloudflare Pages serves,
 * and what a crawler or a `curl` reads without running the bundle, so each
 * check is on the served HTML.
 */

let files: Map<string, string>

beforeAll(async () => {
  const out = (await build({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    build: { write: false },
  })) as RollupOutput
  files = new Map(
    out.output.map(f => [f.fileName, f.type === 'asset' ? String((f as OutputAsset).source) : f.code]),
  )
}, 120_000)

const page = (path: string) => {
  const html = files.get(`${path.slice(1)}index.html`)
  if (!html) throw new Error(`no page for ${path}`)
  return html
}

const SAMPLES = [
  '/standard/a/chord/minor-7/',
  '/standard/e/chord/major/',
  '/standard/c-sharp/chord/7-sharp-9/',
  '/standard/e/scale/dorian/',
  '/standard/b-flat/scale/melodic-minor/',
]

describe('the generated board pages', () => {
  it('emits one page per tier-1 board', () => {
    for (const b of BOARDS) expect(files.has(boardFile(b)), boardPath(b)!).toBe(true)
    expect([...files.keys()].filter(f => /^standard\/[^/]+\/(chord|scale)\//.test(f))).toHaveLength(432)
  })

  for (const path of SAMPLES) {
    it(`${path} carries its own head and body in the served HTML`, () => {
      const html = page(path)
      const content = boardPage(BOARDS.find(b => boardPath(b) === path)!)
      expect(html).toContain(`<link rel="canonical" href="https://withhandlebars.com${path}" />`)
      expect(html.match(/<link rel="canonical"/g)).toHaveLength(1)
      expect(html).toContain(`<meta property="og:url" content="https://withhandlebars.com${path}" />`)
      const title = /<title>([^<]*)<\/title>/.exec(html)![1]!
      expect(title).toContain(content.title.replace(/&/g, '&amp;'))
      expect(html).toMatch(new RegExp(`<h1>[^<]+</h1>`))
      expect(html).toContain('© 2026 CosmoCrew — a brand of')
      expect(html).toContain('<a href="https://luvita.tr/" rel="noopener">Luvita Teknoloji Ltd. Şti.</a>')
    })
  }

  it('hydrates from the same module script and stylesheet as the room', () => {
    const tags = (html: string) => html.match(/<(?:script type="module"|link rel="stylesheet")[^>]*>/g)
    const room = tags(files.get('index.html')!)
    expect(room?.length).toBeGreaterThan(0)
    for (const path of SAMPLES) expect(tags(page(path))).toEqual(room)
    for (const path of SAMPLES) expect(page(path)).toContain('<div id="app"></div>')
  })

  it('names the board in the H1 and the paragraphs', () => {
    const html = page('/standard/a/chord/minor-7/')
    expect(html).toContain('<h1>A Minor Seventh chord (Am7) on the guitar fretboard</h1>')
    expect(html).toMatch(/<p>The A Minor Seventh chord \(Am7\) is made of A \(the root\), C \(minor third\), E \(perfect fifth\) and G \(minor seventh\)\./)
    // The human-written paragraph for the quality (HB-156) follows the board's own tones.
    expect(html).toContain(`<p>${entityCopy.chords.m7}</p>`)
    expect(page('/standard/e/scale/dorian/')).toContain(`<p>${entityCopy.scales.dorian}</p>`)
  })

  it('links neighbours as real anchors to pages that exist', () => {
    for (const path of SAMPLES) {
      const hrefs = [...page(path).matchAll(/<a href="(\/standard\/[^"]*)"/g)].map(m => m[1]!)
      expect(hrefs.length, path).toBeGreaterThan(10)
      expect(hrefs, path).not.toContain(path)
      for (const href of hrefs) expect(files.has(`${href.slice(1)}index.html`), href).toBe(true)
    }
    // A scale page links its diatonic chords; a chord page the scales it sits in.
    expect(page('/standard/c/scale/major/')).toContain('<a href="/standard/a/chord/minor-7/">Am7</a>')
    expect(page('/standard/a/chord/minor-7/')).toContain('<a href="/standard/c/scale/major/">C Major</a>')
  })

  it('gives every page a unique title, description and paragraph', () => {
    const pages = BOARDS.map(b => page(boardPath(b)!))
    for (const re of [/<title>([^<]*)</, /name="description"\s+content="([^"]*)"/, /<p>(The [^<]*)<\/p>/]) {
      const values = pages.map(h => re.exec(h)?.[1])
      expect(values.every(Boolean)).toBe(true)
      expect(new Set(values).size).toBe(values.length)
    }
  })

  // HB-155: a shared link unfurls as the neck it names, not the site's one card.
  it('points og:image and twitter:image at the board\'s own card, with alt text naming it', () => {
    const board = BOARDS.find(b => boardPath(b) === '/standard/a/chord/minor-7/')!
    const html = page('/standard/a/chord/minor-7/')
    const card = 'https://withhandlebars.com/standard/a/chord/minor-7/og.png'
    expect(cardFile(board, 'og')).toBe('standard/a/chord/minor-7/og.png')
    expect(html).toContain(`<meta property="og:image" content="${card}" />`)
    expect(html).toContain(`<meta name="twitter:image" content="${card}" />`)
    expect(html.match(/property="og:image"/g)).toHaveLength(1)
    expect(html).not.toContain('https://withhandlebars.com/og.png')
    expect(html).toMatch(/property="og:image:alt"\s+content="[^"]*A Minor Seventh chord \(Am7\)[^"]*"/)
    expect(html).toContain('<meta name="twitter:image:alt" content="')
    expect(html).toContain('<meta name="robots" content="max-image-preview:large" />')
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!)
    expect(ld.image).toEqual([card, 'https://withhandlebars.com/standard/a/chord/minor-7/og-wide.png'])
  })

  it('gives every page a card of its own', () => {
    const images = BOARDS.map(b => /property="og:image"\s+content="([^"]*)"/.exec(page(boardPath(b)!))?.[1])
    expect(new Set(images).size).toBe(BOARDS.length)
    BOARDS.forEach((b, i) => expect(images[i]).toBe(`https://withhandlebars.com/${cardFile(b, 'og')}`))
  })

  it('leaves the room itself untouched', () => {
    const room = files.get('index.html')!
    expect(room).toContain('<link rel="canonical" href="https://withhandlebars.com/" />')
    expect(room).not.toContain('board-page')
    expect(room).toContain('<meta property="og:image" content="https://withhandlebars.com/og.png" />')
  })
})

describe('sitemap.xml', () => {
  it('is generated: the hand-authored pages and every board, each with lastmod', () => {
    const xml = files.get('sitemap.xml')!
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].map(m => m[1])
    expect(locs.slice(0, 3)).toEqual([
      'https://withhandlebars.com/',
      'https://withhandlebars.com/about',
      'https://withhandlebars.com/privacy',
    ])
    expect(locs).toHaveLength(3 + hubPages().length + 432)
    expect(locs).toContain('https://withhandlebars.com/standard/a/chord/minor-7/')
    expect(xml.match(/<url>/g)).toHaveLength(locs.length)
  })

  it('is well-formed for any path list', () => {
    expect(renderSitemap(['/'], '2026-10-25')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url><loc>https://withhandlebars.com/</loc><lastmod>2026-10-25</lastmod></url>\n' +
        '</urlset>\n',
    )
  })

  it('is not precached by the service worker', () => {
    const manifest = /const MANIFEST = (.+?)\n(?:\/\*\*|const |$)/s.exec(files.get('sw.js')!)![1]!
    const { pages, shell, boards } = JSON.parse(manifest) as { pages: string[]; shell: string[]; boards: string[] }
    expect(pages.sort()).toEqual(['/', '/about', '/privacy'])
    expect(shell.filter(u => u.includes('sitemap') || u.startsWith('/standard/'))).toEqual([])
    // Named by URL so an offline navigation to one opens the cached room.
    expect(boards.sort()).toEqual(BOARDS.map(b => boardPath(b)!).sort())
  })
})

describe('the service worker and the board pages (HB-157, ADR-0008)', () => {
  const manifest = () => {
    const raw = /const MANIFEST = (.+?)\n(?:\/\*\*|const |$)/s.exec(files.get('sw.js')!)![1]!
    return JSON.parse(raw) as { pages: string[]; shell: string[]; boards: string[] }
  }

  it('precaches the same shell however many boards there are: no board page, sitemap or 404 in it', () => {
    const { pages, shell } = manifest()
    const precached = [...pages, ...shell]
    const strays = precached.filter(u => /(^|\/)(index\.html|404\.html|sitemap\.xml)$/.test(u) || /^\/(standard|drop-d)\//.test(u))
    expect(strays).toEqual([])
  })

  it('answers a board path online with the generated file, which is not the room', () => {
    const room = files.get('index.html')!
    for (const path of manifest().boards) {
      const html = page(path)
      expect(html).not.toBe(room)
      expect(html).toContain(`<link rel="canonical" href="https://withhandlebars.com${path}" />`)
    }
  })

  it('keeps 404.html a real page the worker never answers for', () => {
    const { pages, shell, boards } = manifest()
    expect(files.has('404.html')).toBe(true)
    expect([...pages, ...shell, ...boards].filter(u => /(^|\/)404(\.html)?\/?$/.test(u))).toEqual([])
  })
})

describe('the hub pages (HB-154)', () => {
  const hubs = () => hubPages()
  const hrefsOf = (html: string) => [...html.matchAll(/<a href="(\/[^"#?]*)"/g)].map(m => m[1]!)
  const fileOf = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}index.html`)

  it('serves the index, a hub per tuning and a hub per family, all in the build', () => {
    const paths = hubs().map(h => h.path)
    expect(paths).toContain('/boards/')
    expect(paths).toContain('/standard/')
    expect(paths).toContain('/boards/chord/triads/')
    expect(paths).toContain('/boards/scale/major-and-modes/')
    expect(paths).toHaveLength(1 + 1 + 6 + 3)
    for (const h of hubs()) expect(files.has(hubFile(h)), h.path).toBe(true)
  })

  it('gives each hub its own title, description, canonical, paragraph and footer in the served HTML', () => {
    const seen = new Set<string>()
    for (const h of hubs()) {
      const html = files.get(hubFile(h))!
      expect(html, h.path).toContain(`<link rel="canonical" href="https://withhandlebars.com${h.path}" />`)
      expect(html.match(/<link rel="canonical"/g), h.path).toHaveLength(1)
      expect(html, h.path).toMatch(/<h1>[^<]+<\/h1>/)
      expect(html, h.path).toContain(`<p>${h.paragraph.replace(/&/g, '&amp;')}</p>`)
      expect(html, h.path).toContain('© 2026 CosmoCrew — a brand of')
      expect(html, h.path).toContain('<a href="https://luvita.tr/" rel="noopener">Luvita Teknoloji Ltd. Şti.</a>')
      expect(html, h.path).toContain('"@type": "CollectionPage"')
      // A document, not the room: nothing to hydrate over it.
      expect(html, h.path).not.toContain('<div id="app">')
      expect(html, h.path).not.toMatch(/<script type="module"/)
      expect(html, h.path).toMatch(/<link rel="stylesheet"/)
      for (const text of [h.title, h.description, h.paragraph]) {
        expect(seen.has(text), `${h.path}: duplicate "${text}"`).toBe(false)
        seen.add(text)
      }
    }
  })

  it('lists every root and type of a tuning on its hub, and every board of a family on its hub', () => {
    const tuning = hrefsOf(files.get('standard/index.html')!)
    for (const b of BOARDS) expect(tuning, boardPath(b)!).toContain(boardPath(b))
    const triads = hrefsOf(files.get('boards/chord/triads/index.html')!)
    expect(triads.filter(h => /^\/standard\/.+\/(chord|scale)\//.test(h))).toHaveLength(12 * 4)
    const scales = hrefsOf(files.get('boards/scale/major-and-modes/index.html')!)
    expect(scales.filter(h => /^\/standard\/.+\/(chord|scale)\//.test(h))).toHaveLength(12 * 7)
  })

  it('puts every board in exactly one chord or scale family', () => {
    const counted = hubs()
      .filter(h => h.path.startsWith('/boards/chord/') || h.path.startsWith('/boards/scale/'))
      .flatMap(h => h.sections.flatMap(s => s.links))
      .filter(l => /^\/standard\/.+\/(chord|scale)\//.test(l.path))
    expect(counted.map(l => l.path).sort()).toEqual(BOARDS.map(b => boardPath(b)!).sort())
  })

  it('links every hub link to a page that exists, and each board up to its hubs', () => {
    for (const h of hubs()) for (const href of hrefsOf(files.get(hubFile(h))!)) {
      if (href.startsWith('/') && !/\.|^\/$/.test(href)) expect(files.has(fileOf(href)), `${h.path} -> ${href}`).toBe(true)
    }
    const html = page('/standard/a/chord/minor-7/')
    for (const up of ['/standard/', '/boards/chord/sevenths/', '/boards/']) expect(html).toContain(`<a href="${up}">`)
    expect(page('/standard/e/scale/dorian/')).toContain('<a href="/boards/scale/major-and-modes/">')
  })

  it('reaches every tier-1 board within three clicks of / without JavaScript', () => {
    // Only anchors in the HTML the server sends: a crawler or a reader with scripts off.
    const reached = new Map<string, number>([['/', 0]])
    let frontier = ['/']
    for (let clicks = 1; clicks <= 3; clicks++) {
      const next: string[] = []
      for (const from of frontier) {
        const html = files.get(fileOf(from))
        if (!html) continue
        for (const href of hrefsOf(html)) {
          if (reached.has(href)) continue
          reached.set(href, clicks)
          next.push(href)
        }
      }
      frontier = next
    }
    for (const b of BOARDS) expect(reached.get(boardPath(b)!), boardPath(b)!).toBeLessThanOrEqual(3)
  })

  it('lists the hubs in the sitemap after the hand-authored pages and before the boards', () => {
    const locs = [...files.get('sitemap.xml')!.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]!.replace('https://withhandlebars.com', ''))
    expect(locs.slice(3, 3 + hubs().length)).toEqual(hubs().map(h => h.path))
  })

  it('keeps hubs out of the service worker, which would otherwise answer them with the room', () => {
    const raw = /const MANIFEST = (.+?)\n(?:\/\*\*|const |$)/s.exec(files.get('sw.js')!)![1]!
    const { pages, shell, boards } = JSON.parse(raw) as { pages: string[]; shell: string[]; boards: string[] }
    for (const h of hubs()) expect([...pages, ...shell, ...boards], h.path).not.toContain(h.path)
  })
})
