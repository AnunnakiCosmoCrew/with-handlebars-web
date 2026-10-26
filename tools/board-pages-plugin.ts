import { execFileSync } from 'node:child_process'
import {
  CHORD_TYPES,
  SCALE_TYPES,
  describeSelection,
  diatonicChords,
  getSelectionInfo,
  getTuning,
} from '@anunnakicosmocrew/handlebars'
import type { Plugin } from 'vite'
import { BOARDS, boardPath, type Board } from '../src/lib/board-path'
import entityCopy from './boards/entity-copy.json'
import inventory from './boards/tier1.json'

/**
 * One static page per tier-1 board (HB-153, handlebars-docs ADR-0009), and the
 * sitemap that lists them. Each page is the built `index.html` — the same module
 * script and stylesheet, so it hydrates into the ordinary room (ADR-0003: one
 * build, nothing forked) — with a head and a body of its own: title,
 * description, canonical, social tags and JSON-LD for the board, and an H1, an
 * entity paragraph and neighbour links a crawler or a reader without JavaScript
 * gets in the HTML the server sends. The room reads the board back from the
 * path (`src/lib/board-path.ts`).
 *
 * Everything musical on a page comes from the core: names, notes, intervals and
 * the diatonic chords. This file only arranges it.
 */

export const SITE = 'https://withhandlebars.com'

/** Hand-authored pages the sitemap lists before the hubs and boards, as clean URLs. */
export const SITEMAP_PAGES = ['/', '/about', '/privacy']

const ENTITY: Record<Board['mode'], Record<string, string>> = {
  chord: entityCopy.chords,
  scale: entityCopy.scales,
}

/** The human-written paragraph for a board's type; a page without one does not ship. */
function entityOf(b: Board): string {
  const text = ENTITY[b.mode][b.typeId]
  if (!text) throw new Error(`board pages: no entity copy for ${b.mode} ${b.typeId}`)
  return text
}

const CHORDS = new Map(CHORD_TYPES.map(c => [c.id, c]))
const SCALES = new Map(SCALE_TYPES.map(s => [s.id, s]))

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const list = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/**
 * The social cards each board page points at (HB-155): Open Graph's 1200x630,
 * and a 1200-wide 16:9 frame for Discover's large preview. They sit beside the
 * page they belong to and are rendered after the build by
 * `tools/og-cards-plugin.ts`; this is the one place their names are decided.
 */
export const CARD_SIZES = {
  og: { file: 'og.png', width: 1200, height: 630 },
  wide: { file: 'og-wide.png', width: 1200, height: 675 },
} as const
export type CardSize = keyof typeof CARD_SIZES

/** The file a board's card is written to under `dist/`. */
export const cardFile = (b: Board, size: CardSize) => `${pathOf(b).slice(1)}${CARD_SIZES[size].file}`

const selection = (b: Board) => ({ mode: b.mode, root: b.root, typeId: b.typeId })

const typeName = (b: Board) => (b.mode === 'chord' ? CHORDS : SCALES).get(b.typeId)!.name

/** "A Minor Seventh chord (Am7)", "E Dorian scale". */
export function boardLabel(b: Board): string {
  const name = typeName(b)
  if (b.mode === 'scale') return `${b.root} ${name} scale`
  const symbol = getSelectionInfo(selection(b)).title
  // The power chord's own name already says "Chord".
  const noun = /\bchord$/i.test(name) ? name : `${name} chord`
  return symbol === b.root ? `${b.root} ${noun}` : `${b.root} ${noun} (${symbol})`
}

/** The short name a link uses: "Am7", "A Major", "E Dorian". */
function linkText(b: Board): string {
  if (b.mode === 'scale') return `${b.root} ${typeName(b)}`
  const symbol = getSelectionInfo(selection(b)).title
  return symbol === b.root ? `${b.root} ${typeName(b)}` : symbol
}

export type BoardPage = {
  board: Board
  path: string
  url: string
  title: string
  description: string
  h1: string
  /** This board's own tones, from the core: what makes the page unlike its neighbours. */
  paragraph: string
  /** The human-written paragraph for the chord quality or scale (HB-156). */
  entity: string
  /** Neighbour groups: a heading and the boards under it. */
  neighbours: Array<{ heading: string; boards: Board[] }>
  /** The hubs this board belongs to (HB-154): its tuning, its family, and the index. */
  browse: HubLink[]
  /** Absolute URLs of this board's social cards. */
  images: Record<CardSize, string>
  /** What the card shows, for `og:image:alt`. */
  imageAlt: string
}

const pathOf = (b: Board) => boardPath(b)!

// Every chord page asks every scale for its chords, so each scale is asked once.
const diatonicCache = new Map<string, ReturnType<typeof diatonicChords>>()
const diatonicOf = (b: Board) => {
  const key = `${b.root}|${b.typeId}`
  let chords = diatonicCache.get(key)
  if (!chords) diatonicCache.set(key, (chords = diatonicChords({ ...selection(b), mode: 'scale' })))
  return chords
}
const same = (a: Board, b: Board) =>
  a.tuningId === b.tuningId && a.root === b.root && a.mode === b.mode && a.typeId === b.typeId

/** A board's page content: pure, so a spec can check it without a build. */
export function boardPage(board: Board, boards: Board[] = BOARDS): BoardPage {
  const tuning = getTuning(board.tuningId)
  const label = boardLabel(board)
  const path = pathOf(board)
  const anatomy = describeSelection(selection(board))
  const notes = anatomy.tones.map(t => t.note)
  const tones = anatomy.tones.map(t => {
    const words = t.role === 'root' ? 'the root' : t.intervalWords
    return `${t.note} (${words}${t.optional ? ', optional' : ''})`
  })

  const kind = board.mode
  const paths = new Set(boards.map(pathOf))
  const published = (b: Board) => boardPath(b) !== null && paths.has(pathOf(b))
  const sameTuning = boards.filter(b => b.tuningId === board.tuningId && !same(b, board))
  const neighbours: BoardPage['neighbours'] = []

  if (kind === 'scale') {
    // The core spells each degree's root the scale's way, so only the chords
    // whose spelling is a published root become links.
    const diatonic = diatonicOf(board)
      .map(c => ({ tuningId: board.tuningId, root: c.root, mode: 'chord' as const, typeId: c.typeId }))
      .filter(published)
    if (diatonic.length) neighbours.push({ heading: `Chords in ${board.root} ${typeName(board)}`, boards: diatonic })
  } else {
    const containing = sameTuning.filter(
      s =>
        s.mode === 'scale' &&
        diatonicOf(s).some(c => c.root === board.root && c.typeId === board.typeId),
    )
    if (containing.length) neighbours.push({ heading: `Scales with ${linkText(board)}`, boards: containing })
  }
  const onRoot = (mode: Board['mode']) => sameTuning.filter(b => b.root === board.root && b.mode === mode)
  neighbours.push({ heading: `More chords on ${board.root}`, boards: onRoot('chord') })
  neighbours.push({ heading: `More scales on ${board.root}`, boards: onRoot('scale') })
  const otherRoots = sameTuning.filter(b => b.mode === kind && b.typeId === board.typeId)
  neighbours.push({ heading: `${typeName(board)} in other keys`, boards: otherRoots })

  const strings = tuning.letters.join(' ')
  const instrument = tuning.instrument ?? 'guitar'
  return {
    board,
    path,
    url: `${SITE}${path}`,
    title: `${label} — ${instrument} fretboard, ${tuning.name.toLowerCase()} tuning | With Handlebars`,
    description:
      `${label}: ${list(notes)}. Every ${kind} tone across the whole ${instrument} neck in ` +
      `${tuning.name.toLowerCase()} tuning (${strings}), with sampled playback.`,
    h1: `${label} on the ${instrument} fretboard`,
    // Built from the core's anatomy of the board, so it is never the same twice;
    // the entity copy beside it is per quality or scale, shared across roots.
    paragraph:
      `The ${label} is made of ${list(tones)}. The fretboard shows every one of ` +
      `them across the neck in ${tuning.name.toLowerCase()} tuning (${strings}), and ` +
      `plays them back so you can hear the ${kind}.`,
    entity: entityOf(board),
    neighbours: neighbours.filter(n => n.boards.length),
    browse: browseLinks(board),
    images: { og: `${SITE}/${cardFile(board, 'og')}`, wide: `${SITE}/${cardFile(board, 'wide')}` },
    imageAlt:
      `The With Handlebars fretboard: every tone of the ${label} across a 24-fret ${instrument} neck ` +
      `in ${tuning.name.toLowerCase()} tuning, each dot coloured by its role in the ${kind}.`,
  }
}

/** Replace the one match of `re` in `html`, or fail the build: a template that changed shape must not ship pages missing a tag. */
function replaceOnce(html: string, re: RegExp, to: (match: string, ...groups: string[]) => string, what: string): string {
  const count = html.match(new RegExp(re.source, 'g'))?.length ?? 0
  if (count !== 1) throw new Error(`board pages: index.html has ${count} ${what}, expected 1`)
  return html.replace(re, to)
}

const attr = (name: string) => new RegExp(`(<meta\\s+(?:name|property)="${name}"\\s+content=")[^"]*(")`)

/** What a head needs; the social card is a board's own, and a hub keeps the template's site card. */
type HeadPage = Pick<BoardPage, 'title' | 'h1' | 'description' | 'url'> & Partial<Pick<BoardPage, 'images' | 'imageAlt'>>

/** The JSON-LD for a board or hub page: the page, the app it belongs to, and who owns it. */
export function boardJsonLd(
  page: HeadPage,
  type: 'WebPage' | 'CollectionPage' = 'WebPage',
): Record<string, unknown> {
  const luvita = { '@type': 'Organization', name: 'Luvita Teknoloji Ltd. Şti.', url: 'https://luvita.tr/' }
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: page.title,
    headline: page.h1,
    description: page.description,
    url: page.url,
    // Both frames, so a surface that wants 16:9 (Discover) has one to take.
    ...(page.images && { image: [page.images.og, page.images.wide] }),
    inLanguage: 'en',
    isPartOf: { '@type': 'WebApplication', name: 'With Handlebars', url: `${SITE}/` },
    creator: { '@type': 'Organization', name: 'CosmoCrew', url: 'https://cosmocrew.dev/' },
    publisher: luvita,
    copyrightHolder: luvita,
    copyrightYear: 2026,
  }
}

/** The template with a page's own title, description, canonical, social tags and JSON-LD. */
function renderHead(
  template: string,
  page: HeadPage,
  type: 'WebPage' | 'CollectionPage',
): string {
  const meta = (html: string, name: string, value: string) =>
    replaceOnce(html, attr(name), (_, open, close) => `${open}${escape(value)}${close}`, name)

  let html = template
  html = replaceOnce(html, /<title>[^<]*<\/title>/, () => `<title>${escape(page.title)}</title>`, '<title>')
  html = meta(html, 'description', page.description)
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*" \/>/,
    () => `<link rel="canonical" href="${page.url}" />`,
    'canonical',
  )
  html = meta(html, 'og:title', page.title)
  html = meta(html, 'og:description', page.description)
  html = meta(html, 'og:url', page.url)
  if (page.images && page.imageAlt) {
    html = meta(html, 'og:image', page.images.og)
    html = meta(html, 'og:image:alt', page.imageAlt)
    html = meta(html, 'twitter:image', page.images.og)
  }
  html = replaceOnce(
    html,
    /<meta name="twitter:card"[^>]*\/>/,
    m =>
      `${m}\n    <meta name="twitter:title" content="${escape(page.title)}" />` +
      `\n    <meta name="twitter:description" content="${escape(page.description)}" />` +
      (page.imageAlt
        ? `\n    <meta name="twitter:image:alt" content="${escape(page.imageAlt)}" />` +
          // A large card in Discover and image results needs the page to allow one.
          `\n    <meta name="robots" content="max-image-preview:large" />`
        : ''),
    'twitter:card',
  )
  // Escaped for a <script>: a "<" in JSON would be read as markup.
  const ld = JSON.stringify(boardJsonLd(page, type), null, 2).replace(/</g, '\\u003c').replace(/\n/g, '\n      ')
  return replaceOnce(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    () => `<script type="application/ld+json">\n      ${ld}\n    </script>`,
    'JSON-LD block',
  )
}

const linkList = (links: HubLink[], indent: string) =>
  `${indent}<ul>\n` +
  links.map(l => `${indent}  <li><a href="${l.path}">${escape(l.text)}</a></li>`).join('\n') +
  `\n${indent}</ul>`

/** The page's HTML: the built `index.html` with this board's head and body. */
export function renderBoardPage(template: string, page: BoardPage): string {
  let html = renderHead(template, page, 'WebPage')

  const browse = `        <h2>Browse</h2>\n${linkList(page.browse, '        ')}`
  const links = [browse, ...page.neighbours
    .map(
      n =>
        `        <h2>${escape(n.heading)}</h2>\n        <ul>\n` +
        n.boards.map(b => `          <li><a href="${pathOf(b)}">${escape(linkText(b))}</a></li>`).join('\n') +
        `\n        </ul>`,
    )]
    .join('\n')
  const body =
    `<div id="app"></div>\n` +
    `    <article class="board-page">\n` +
    `      <h1>${escape(page.h1)}</h1>\n` +
    `      <p>${escape(page.paragraph)}</p>\n` +
    `      <p>${escape(page.entity)}</p>\n` +
    `      <nav aria-label="Related boards">\n${links}\n      </nav>\n` +
    `    </article>\n` +
    `    <noscript>\n` +
    `      <p>\n` +
    `        The interactive fretboard needs JavaScript; <a href="/about">read about With Handlebars</a> without it.\n` +
    `      </p>\n` +
    `      <p>\n` +
    `        © 2026 CosmoCrew — a brand of\n` +
    `        <a href="https://luvita.tr/" rel="noopener">Luvita Teknoloji Ltd. Şti.</a>\n` +
    `      </p>\n` +
    `    </noscript>`
  html = replaceOnce(html, /<div id="app"><\/div>\s*<noscript>[\s\S]*?<\/noscript>/, () => body, 'room mount + noscript')
  return html
}

// ---- Hubs (HB-154) ---------------------------------------------------------
//
// Pages that make the boards a browseable hierarchy: an index of everything, a
// hub per tuning, and a hub per chord or scale family. Unlike a board page a hub
// is a plain document — it does not mount the room — so it ships the built
// stylesheet and no script.

export type HubLink = { text: string; path: string }
type Family = { slug: string; name: string; types: string[] }

const FAMILIES: Record<Board['mode'], Family[]> = inventory.families
const TUNING_SLUG = new Map(inventory.tunings.map(t => [t.id, t.slug]))
const FAMILY_COPY = entityCopy.families as Record<string, string>

export const INDEX_PATH = '/boards/'
const tuningHubPath = (tuningId: string) => `/${TUNING_SLUG.get(tuningId)}/`
const familyHubPath = (mode: Board['mode'], f: Family) => `${INDEX_PATH}${mode}/${f.slug}/`
const familyOf = (b: Board) => FAMILIES[b.mode].find(f => f.types.includes(b.typeId))!
const tuningName = (id: string) => getTuning(id).name

/** The hubs a board links up to: its tuning, its family, and the index. */
function browseLinks(b: Board): HubLink[] {
  const f = familyOf(b)
  return [
    { text: `${tuningName(b.tuningId)} tuning: every chord and scale`, path: tuningHubPath(b.tuningId) },
    { text: `${f.name}: every root and tuning`, path: familyHubPath(b.mode, f) },
    { text: 'All boards', path: INDEX_PATH },
  ]
}

export type HubPage = {
  path: string
  url: string
  title: string
  description: string
  h1: string
  paragraph: string
  /** The trail back up, root first, not including the page itself. */
  crumbs: HubLink[]
  sections: Array<{ heading: string; level: 2 | 3; links: HubLink[] }>
}

const boardLink = (b: Board): HubLink => ({ text: linkText(b), path: pathOf(b) })

/** The boards of one family in one tuning, a heading per type and a link per root. */
function familySections(boards: Board[], kind: Board['mode'], f: Family, heading: string): HubPage['sections'] {
  const types = f.types.flatMap(typeId => {
    const own = boards.filter(b => b.typeId === typeId && b.mode === kind)
    return own.length ? [{ heading: typeName(own[0]!), level: 3 as const, links: own.map(boardLink) }] : []
  })
  return types.length ? [{ heading, level: 2, links: [] }, ...types] : []
}

/** Every hub page, derived from the boards given. Pure, so a spec can check it without a build. */
export function hubPages(boards: Board[] = BOARDS): HubPage[] {
  const tuningIds = [...new Set(boards.map(b => b.tuningId))]
  for (const id of tuningIds) {
    if (!TUNING_SLUG.has(id) || TUNING_SLUG.get(id) === 'boards') throw new Error(`hub pages: no usable slug for tuning ${id}`)
  }
  const kinds = (['chord', 'scale'] as const).filter(k => boards.some(b => b.mode === k))
  const families = kinds.flatMap(k => FAMILIES[k].map(f => ({ kind: k, family: f })))
  const count = (kind: Board['mode']) => new Set(boards.filter(b => b.mode === kind).map(b => b.typeId)).size
  const home: HubLink = { text: 'With Handlebars', path: '/' }
  const index: HubLink = { text: 'All boards', path: INDEX_PATH }

  const pages: HubPage[] = []
  const hub = (path: string, rest: Omit<HubPage, 'path' | 'url'>) =>
    pages.push({ path, url: `${SITE}${path}`, ...rest })

  const tuningLinks = tuningIds.map(id => ({ text: `${tuningName(id)} tuning`, path: tuningHubPath(id) }))
  const familyLinks = (kind: Board['mode']): HubLink[] =>
    families.filter(f => f.kind === kind).map(f => ({ text: f.family.name, path: familyHubPath(kind, f.family) }))

  hub(INDEX_PATH, {
    title: 'Every chord and scale on the fretboard, by tuning and family | With Handlebars',
    description:
      `Browse ${boards.length} fretboard maps: ${count('chord')} chord qualities and ${count('scale')} scales in ` +
      `${list(tuningIds.map(id => `${tuningName(id).toLowerCase()} tuning`))}, grouped by tuning and by chord or scale family.`,
    h1: 'All chord and scale boards',
    paragraph: entityCopy.families.index,
    crumbs: [home],
    sections: [
      { heading: 'Tunings', level: 2, links: tuningLinks },
      ...kinds.map(k => ({ heading: `${k === 'chord' ? 'Chord' : 'Scale'} families`, level: 2 as const, links: familyLinks(k) })),
    ],
  })

  for (const id of tuningIds) {
    const own = boards.filter(b => b.tuningId === id)
    const tuning = getTuning(id)
    const instrument = tuning.instrument ?? 'guitar'
    const strings = tuning.letters.join(' ')
    hub(tuningHubPath(id), {
      title: `${tuning.name} tuning chords and scales — ${instrument} fretboard | With Handlebars`,
      description:
        `Every chord and scale board in ${tuning.name.toLowerCase()} tuning (${strings}) on the ${instrument}: ` +
        `${own.length} fretboard maps across ${new Set(own.map(b => b.root)).size} roots.`,
      h1: `${tuning.name} tuning: every chord and scale on the ${instrument} fretboard`,
      paragraph: (entityCopy.tunings as Record<string, string>)[id] ?? '',
      crumbs: [home, index],
      sections: [
        ...families.flatMap(({ kind, family }) => familySections(own, kind, family, family.name)),
        { heading: 'Browse by family', level: 2, links: [...familyLinks('chord'), ...familyLinks('scale')] },
      ],
    })
  }

  for (const { kind, family } of families) {
    const noun = kind
    const own = boards.filter(b => b.mode === kind && family.types.includes(b.typeId))
    hub(familyHubPath(kind, family), {
      title: `${family.name}: ${noun} fretboard maps for every root | With Handlebars`,
      description:
        `${family.name} on the fretboard: ${own.length} ${noun} maps across ${new Set(own.map(b => b.tuningId)).size} ` +
        `tuning${tuningIds.length === 1 ? '' : 's'} and every root, with sampled playback.`,
      h1: `${family.name} on the fretboard`,
      paragraph: FAMILY_COPY[`${kind}:${family.slug}`] ?? '',
      crumbs: [home, index],
      sections: [
        ...tuningIds.flatMap(id =>
          familySections(own.filter(b => b.tuningId === id), kind, family, `${tuningName(id)} tuning`),
        ),
        {
          heading: `More ${noun} families`,
          level: 2 as const,
          links: familyLinks(kind).filter(l => l.path !== familyHubPath(kind, family)),
        },
        { heading: 'Tunings', level: 2 as const, links: tuningLinks },
      ],
    })
  }
  for (const p of pages) if (!p.paragraph) throw new Error(`hub pages: no paragraph for ${p.path}`)
  return pages
}

/** A hub's HTML: the built `index.html` with this hub's head, and a body with no room to mount. */
export function renderHubPage(template: string, page: HubPage): string {
  let html = renderHead(template, page, 'CollectionPage')
  // A hub is a document: no module script to hydrate a room over it.
  html = html.replace(/\s*<script type="module"[^>]*><\/script>/g, '').replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
  const sections = page.sections
    .map(s => `      <h${s.level}>${escape(s.heading)}</h${s.level}>` + (s.links.length ? `\n${linkList(s.links, '      ')}` : ''))
    .join('\n')
  const crumbs = [...page.crumbs.map(c => `<a href="${c.path}">${escape(c.text)}</a>`), escape(page.h1)]
  const body =
    `<body>\n` +
    `    <main class="board-page">\n` +
    `      <nav aria-label="Breadcrumb">${crumbs.slice(0, -1).join(' › ')}</nav>\n` +
    `      <h1>${escape(page.h1)}</h1>\n` +
    `      <p>${escape(page.paragraph)}</p>\n` +
    `      <p><a href="/">Open the fretboard</a></p>\n${sections}\n` +
    `    </main>\n` +
    `    <footer class="board-page">\n` +
    `      <p>\n` +
    `        © 2026 CosmoCrew — a brand of\n` +
    `        <a href="https://luvita.tr/" rel="noopener">Luvita Teknoloji Ltd. Şti.</a>\n` +
    `      </p>\n` +
    `    </footer>\n` +
    `  </body>`
  return replaceOnce(html, /<body>[\s\S]*<\/body>/, () => body, '<body>')
}

/** The file a hub page is written to under `dist/`. */
export const hubFile = (page: HubPage) => `${page.path.slice(1)}index.html`

/** `sitemap.xml` for the hand-authored pages and every board, all with the same `lastmod`. */
export function renderSitemap(paths: string[], lastmod: string): string {
  const urls = paths.map(p => `  <url><loc>${SITE}${p}</loc><lastmod>${lastmod}</lastmod></url>`)
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  )
}

/**
 * The day the site last changed: the commit being built, so a rebuild of the
 * same commit says the same thing and `lastmod` stays something a crawler can
 * trust. Today when there is no git to ask.
 */
function lastModified(root: string): string {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** The file a board page is written to under `dist/`. */
export const boardFile = (b: Board) => `${pathOf(b).slice(1)}index.html`

export function boardPagesPlugin(root: string): Plugin {
  return {
    name: 'handlebars-board-pages',
    apply: 'build',
    // After Vite's own plugins, so index.html already carries the hashed script
    // and stylesheet the pages share.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('board pages: no index.html in the bundle')
      const template = String(index.source)
      for (const board of BOARDS) {
        this.emitFile({ type: 'asset', fileName: boardFile(board), source: renderBoardPage(template, boardPage(board)) })
      }
      const hubs = hubPages()
      for (const hub of hubs) {
        this.emitFile({ type: 'asset', fileName: hubFile(hub), source: renderHubPage(template, hub) })
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: renderSitemap([...SITEMAP_PAGES, ...hubs.map(h => h.path), ...BOARDS.map(pathOf)], lastModified(root)),
      })
    },
  }
}
