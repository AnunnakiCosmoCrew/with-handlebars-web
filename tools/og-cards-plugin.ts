import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { createServer, type Plugin } from 'vite'
import { BOARDS, boardPath, type Board } from '../src/lib/board-path'
import { CARD_SIZES, SITE, cardFile, type CardSize } from './board-pages-plugin'

/**
 * The per-board social cards (HB-155): after the build has written the board
 * pages, photograph `og.html` — the real Fretboard with the real design tokens,
 * the page `tools/render-og.sh` shoots for `public/og.png` — once per board and
 * size, in headless Chromium driven by Playwright, and write each card beside
 * its page in `dist/`. The bundle is untouched (ADR-0003: one build, nothing
 * forked); the cards are files next to it, like the pages they illustrate.
 *
 * Opt-in with `HB_OG_CARDS=1`, because it needs a browser: the deploy turns it
 * on, a plain `npm run build` and the in-memory build the specs run do not.
 * Cards are never committed. Each one is cached under a key made of everything
 * that draws it, so a rebuild renders only what changed — an entity-copy edit
 * renders nothing, a new board renders its own two cards — and CI keeps the
 * cache directory between runs.
 */

/** Where rendered cards are kept between builds; CI caches this directory. */
export const DEFAULT_CACHE_DIR = '.og-cards'

/**
 * What the card's picture depends on, relative to the repo root: the card and
 * the room code it draws with, its page, and this renderer. The theory core's
 * build is added on top. Board-page copy is deliberately not here.
 */
const RENDER_INPUTS = ['og.html', 'src', 'tools/og-cards-plugin.ts']

/** How many cards are photographed at once. */
const CONCURRENCY = 6

export type CardJob = { board: Board; size: CardSize; file: string; query: string; key: string }

const sha = (parts: Iterable<string | Uint8Array>) => {
  const h = createHash('sha256')
  for (const p of parts) h.update(p)
  return h.digest('hex')
}

function filesUnder(path: string): string[] {
  if (!existsSync(path)) return []
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => filesUnder(join(path, e.name)))
}

/** One hash of every file under `paths`, names included, so a rename counts too. */
export function inputsHash(root: string, paths: string[]): string {
  const parts: Array<string | Uint8Array> = []
  for (const p of paths) {
    for (const file of filesUnder(resolve(root, p))) parts.push(relative(root, file), '\0', readFileSync(file), '\0')
  }
  return sha(parts)
}

/** Every card the build should have, with the cache key each is stored under. Pure. */
export function cardJobs(inputs: string, boards: Board[] = BOARDS): CardJob[] {
  return boards.flatMap(board =>
    (Object.keys(CARD_SIZES) as CardSize[]).map(size => {
      const query = `board=${encodeURIComponent(boardPath(board)!)}${size === 'og' ? '' : `&size=${size}`}`
      return { board, size, file: cardFile(board, size), query, key: sha([inputs, '\0', query]).slice(0, 24) }
    }),
  )
}

/**
 * Every `og:image` and `twitter:image` on an HTML page under `outDir` whose
 * URL is on the site but has no file there. Empty is the only passing answer.
 */
export function missingImages(outDir: string): string[] {
  const missing: string[] = []
  const re = /<meta\s+(?:name|property)="(?:og:image|twitter:image)"\s+content="([^"]*)"/g
  for (const file of filesUnder(outDir).filter(f => f.endsWith('.html'))) {
    for (const [, url] of readFileSync(file, 'utf8').matchAll(re)) {
      const path = url!.startsWith(`${SITE}/`) ? url!.slice(SITE.length + 1) : null
      if (path === null || !existsSync(join(outDir, path))) missing.push(`${relative(outDir, file)} → ${url}`)
    }
  }
  return missing
}

async function render(root: string, jobs: CardJob[], cacheDir: string): Promise<void> {
  // Imported here rather than at the top so a build without cards, and every
  // spec that loads vite.config.ts, never needs the browser package.
  const { chromium } = await import('playwright')
  const server = await createServer({
    root,
    configFile: resolve(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { port: 0, strictPort: false },
  })
  await server.listen()
  const base = server.resolvedUrls?.local[0]
  const browser = await chromium.launch()
  try {
    if (!base) throw new Error('og cards: the dev server reported no URL')
    // Shot at 2x and scaled back to CSS pixels by the browser: text and dot
    // labels come out far cleaner than a 1x grab, as in tools/render-og.sh.
    // Dark, whatever the machine prefers: the card is the dark theme.
    const context = await browser.newContext({
      viewport: { width: 1200, height: 675 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    })
    // One page first, on its own: a cold dev server discovers and optimizes the
    // card's dependencies on the first load and may reload the page to use them,
    // which must not land in the middle of a screenshot.
    const warm = await context.newPage()
    await warm.goto(`${base}og.html`, { waitUntil: 'networkidle' })
    await warm.locator('.card').waitFor()
    await warm.close()

    const queue = [...jobs]
    const worker = async () => {
      const page = await context.newPage()
      for (let job = queue.shift(); job; job = queue.shift()) {
        await page.goto(`${base}og.html?${job.query}`)
        const card = page.locator('.card')
        await card.waitFor()
        await page.evaluate(() => document.fonts.ready)
        const png = await card.screenshot({ scale: 'css', type: 'png', animations: 'disabled' })
        // Written aside and renamed in, so a run killed mid-write never leaves a
        // truncated file the next build would take for a cached card.
        const to = join(cacheDir, `${job.key}.png`)
        writeFileSync(`${to}.tmp`, png)
        renameSync(`${to}.tmp`, to)
      }
      await page.close()
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker))
  } finally {
    await browser.close()
    await server.close()
  }
}

export function ogCardsPlugin(root: string): Plugin {
  let outDir = ''
  return {
    name: 'handlebars-og-cards',
    apply: (_config, env) => env.command === 'build' && process.env.HB_OG_CARDS === '1',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    // writeBundle, not generateBundle: the cards are photographs of a running
    // page, not modules, and only a build that writes `dist/` wants them.
    async writeBundle() {
      const started = Date.now()
      const cacheDir = resolve(root, process.env.HB_OG_CARDS_CACHE || DEFAULT_CACHE_DIR)
      mkdirSync(cacheDir, { recursive: true })

      const core = realpathSync(resolve(root, 'node_modules/@anunnakicosmocrew/handlebars/dist'))
      // The browser draws the picture too: a Playwright upgrade re-renders everything.
      const browser = readFileSync(resolve(root, 'node_modules/playwright-core/package.json'))
      const inputs = sha([inputsHash(root, RENDER_INPUTS), inputsHash(core, ['.']), browser])
      const jobs = cardJobs(inputs)
      const todo = jobs.filter(j => !existsSync(join(cacheDir, `${j.key}.png`)))
      if (todo.length) await render(root, todo, cacheDir)

      for (const job of jobs) {
        const to = join(outDir, job.file)
        mkdirSync(dirname(to), { recursive: true })
        copyFileSync(join(cacheDir, `${job.key}.png`), to)
      }
      // The cache holds the current set and nothing else, so it never grows.
      const keep = new Set(jobs.map(j => `${j.key}.png`))
      for (const f of readdirSync(cacheDir)) if (!keep.has(f)) rmSync(join(cacheDir, f))

      const missing = missingImages(outDir)
      if (missing.length) {
        throw new Error(`og cards: ${missing.length} page(s) point at an image dist does not have:\n  ${missing.slice(0, 20).join('\n  ')}`)
      }
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      console.log(`og cards: ${jobs.length} cards, ${todo.length} rendered, ${jobs.length - todo.length} from cache, ${seconds}s`)
    },
  }
}
