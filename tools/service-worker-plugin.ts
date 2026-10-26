import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Builds `sw.js` from `service-worker/sw.js` (HB-93, ADR-0008). The worker
 * needs to know every file the build emitted, and Vite's filenames are only
 * known once the bundle exists, so the list is spliced in here rather than
 * written by hand or fetched at runtime.
 */

/** Static pages the build emits, and the clean URL (under the base) Cloudflare Pages serves each at. */
const PAGE_URLS: Record<string, string> = {
  'index.html': '',
  'about.html': 'about',
  'privacy.html': 'privacy',
}

/** A board page's file: `<tuning>/<root>/<kind>/<type>/index.html`. */
const BOARD_FILE = /^[^/]+\/[^/]+\/(?:chord|scale)\/[^/]+\/index\.html$/

/**
 * Files from `public/` that belong to the offline shell. An allow-list on
 * purpose: `public/` also holds the 10 MB of samples (cached on their own
 * terms), `_headers`, `robots.txt` and the apple-app-site-association file,
 * none of which the worker may answer for.
 */
export const PUBLIC_SHELL = [
  'apple-touch-icon.png',
  'download-on-the-app-store.svg',
  'favicon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'site.webmanifest',
]

/** Cached the moment the worker installs, so the first tap offline makes a sound. */
export const PRECACHED_SAMPLES = ['acoustic_guitar_nylon-ogg.js']

export type WorkerInputs = {
  base: string
  /** Emitted file name → contents, for everything under `dist/`. */
  emitted: Map<string, string | Uint8Array>
  /** Contents of the `PUBLIC_SHELL` files, by file name. */
  publicShell: Map<string, Uint8Array>
  /** Contents of every sample file, by file name. */
  samples: Map<string, Uint8Array>
}

const hash = (parts: Iterable<string | Uint8Array>) => {
  const h = createHash('sha256')
  for (const p of parts) h.update(p)
  return h.digest('hex').slice(0, 12)
}

/** The worker source with its three constants filled in. Pure, so it can be tested. */
export function renderWorker(template: string, inputs: WorkerInputs): string {
  const { base, emitted, publicShell, samples } = inputs
  const url = (file: string) => `${base}${file}`

  const pages: string[] = []
  const boards: string[] = []
  const shell: string[] = []
  const fingerprint: Array<string | Uint8Array> = []

  for (const [file, contents] of [...emitted].sort(([a], [b]) => a.localeCompare(b))) {
    // The worker can't cache itself, and the sourcemap/manifest files are
    // build metadata rather than something a page asks for.
    if (file === 'sw.js' || file.endsWith('.map')) continue
    // The 404 page is for the server to send with a 404 (HB-151). Precaching it would
    // 404 the install, and listing it as a page would let the worker answer an
    // unknown path from cache.
    if (file === '404.html') continue
    // Board pages (HB-153) are hundreds of files and stay out of the precache
    // (ADR-0009 §6). They are listed by URL instead, so offline the worker can
    // open one as the room, which reads the board from the path. The sitemap is for crawlers.
    // The hub pages (HB-154) are generated the same way but are plain documents, not
    // the room, so they are neither precached nor answered from the cached room.
    if (file.endsWith('/index.html') && !(file in PAGE_URLS)) {
      if (BOARD_FILE.test(file)) boards.push(url(file.slice(0, -'index.html'.length)))
      continue
    }
    if (file === 'sitemap.xml') continue
    if (file in PAGE_URLS) pages.push(url(PAGE_URLS[file]!))
    else shell.push(url(file))
    fingerprint.push(file, contents)
  }
  for (const [file, contents] of [...publicShell].sort(([a], [b]) => a.localeCompare(b))) {
    shell.push(url(file))
    fingerprint.push(file, contents)
  }

  const sampleFiles = [...samples].sort(([a], [b]) => a.localeCompare(b))
  const versions = Object.fromEntries(
    sampleFiles.map(([file, contents]) => [`${base}soundfonts/${file}`, hash([contents])]),
  )

  return template
    .replace('__MANIFEST__', () => JSON.stringify({ base, pages, shell, boards }, null, 2))
    .replace('__BUILD__', () => JSON.stringify(hash(fingerprint)))
    .replace(
      '__SAMPLES__',
      () =>
        JSON.stringify(
          {
            name: 'hb-samples',
            prefix: `${base}soundfonts/`,
            precache: PRECACHED_SAMPLES.map(f => `${base}soundfonts/${f}`),
            versions,
          },
          null,
          2,
        ),
    )
}

export function serviceWorkerPlugin(root: string): Plugin {
  let base = '/'
  return {
    name: 'handlebars-service-worker',
    apply: 'build',
    // After Vite's own plugins: the HTML pages are only in the bundle once they have run.
    enforce: 'post',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`
    },
    generateBundle(_options, bundle) {
      const emitted = new Map<string, string | Uint8Array>()
      for (const [file, item] of Object.entries(bundle)) {
        emitted.set(file, item.type === 'chunk' ? item.code : item.source)
      }

      const read = (dir: string, file: string) => new Uint8Array(readFileSync(join(root, dir, file)))
      const publicShell = new Map(PUBLIC_SHELL.map(f => [f, read('public', f)]))
      const samples = new Map(
        readdirSync(join(root, 'public/soundfonts'))
          .filter(f => f.endsWith('-ogg.js'))
          .map(f => [f, read('public/soundfonts', f)]),
      )

      const template = readFileSync(join(root, 'service-worker/sw.js'), 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderWorker(template, { base, emitted, publicShell, samples }),
      })
    },
  }
}
