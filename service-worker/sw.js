/*
 * The site's service worker (HB-93, ADR-0008). This is a template, not a file
 * that ships as written: tools/service-worker-plugin.ts replaces the three
 * `__TOKEN__` constants below at build time and emits the result as `sw.js`.
 *
 * It exists for two reasons. Chrome on Android offers "Install app" only for a
 * site with a fetch handler; and a cold start with no network should still open
 * the room. It is deliberately *not* a network layer: every subresource the
 * app needs ships in the build (test/offline-parity.spec.ts), so there is
 * nothing to fetch that isn't already in the list below.
 *
 * Three rules, in order of importance:
 *  1. Only ever answer a request we can answer from our own caches, or pass it
 *     through untouched. Never invent a response, never "fall back to the
 *     room" for a URL we don't know. The one place it answers with the room is
     a board page it was told about (MANIFEST.boards, HB-153), and only when
     the network can't: every board page is the room with its board in the path.
 *  2. The shell cache is keyed by the build, so a deploy installs beside the old
 *     one and only replaces it once every file has arrived.
 *  3. Samples are keyed by their own content hash, not the build, so a code
 *     deploy does not make a phone download 10 MB of guitar again.
 */

/** { base, pages: ['/', '/about', …], shell: ['/assets/x.js', …], boards: ['/standard/a/chord/minor-7/', …] }: clean URLs, as navigated to. */
const MANIFEST = __MANIFEST__
/** Hash of everything in the shell; changes whenever any shell file does. */
const BUILD = __BUILD__
/** { name: 'hb-samples', prefix: '/soundfonts/', precache: ['/soundfonts/x-ogg.js'], versions: { '/soundfonts/x-ogg.js': '<hash>' } } */
const SAMPLES = __SAMPLES__

const SHELL_CACHE = `hb-shell-${BUILD}`
// A page is stored and looked up under its normalized path, so a base such as
// `/hb/` (whose index is `/hb/`) matches the `/hb` that `normalize` gives a navigation.
const PAGES = new Set(MANIFEST.pages.map(normalize))
const SHELL = new Set(MANIFEST.shell)
const BOARDS = new Set(MANIFEST.boards.map(normalize))

/**
 * A response that followed a redirect can't be handed to a navigation, so
 * rebuild it clean. Cloudflare Pages serves /about from about.html directly,
 * so this should never fire there; it is for hosts that behave differently.
 */
function clean(response) {
  if (!response.redirected) return response
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/** `cache: 'reload'` skips the HTTP cache, so one build's shell is never assembled from two. */
async function download(url) {
  const response = await fetch(new Request(url, { cache: 'reload' }))
  if (!response.ok) throw new Error(`precache ${url}: ${response.status}`)
  return clean(response)
}

async function install() {
  const shell = await caches.open(SHELL_CACHE)
  await Promise.all(
    [...MANIFEST.pages, ...MANIFEST.shell].map(async url =>
      shell.put(normalize(url), await download(url)),
    ),
  )
  // The default instrument, so the first tap offline makes a sound. The other
  // three are cached the first time they are played.
  const samples = await caches.open(SAMPLES.name)
  await Promise.all(
    SAMPLES.precache.map(async url => {
      const key = sampleKey(url)
      if (!(await samples.match(key))) await samples.put(key, await download(url))
    }),
  )
}

/** A sample's cache key carries its content hash, so an edited file is a new entry and the rest stay. */
function sampleKey(pathname) {
  const version = SAMPLES.versions[pathname]
  return version ? `${pathname}?v=${version}` : pathname
}

async function activate() {
  const keep = new Set([SHELL_CACHE, SAMPLES.name])
  const names = await caches.keys()
  await Promise.all(
    names
      .filter(n => (n.startsWith('hb-shell-') || n.startsWith('hb-samples-')) && !keep.has(n))
      .map(n => caches.delete(n)),
  )
  // Within the samples cache, drop the entries of files that have since changed.
  const samples = await caches.open(SAMPLES.name)
  const current = new Set(Object.keys(SAMPLES.versions).map(sampleKey))
  await Promise.all(
    (await samples.keys())
      .filter(r => {
        const u = new URL(r.url)
        return !current.has(u.pathname + u.search)
      })
      .map(r => samples.delete(r)),
  )
  await self.clients.claim()
}

self.addEventListener('install', event => {
  // A failed install rejects here, the old worker stays in charge, and the
  // browser retries on the next navigation. skipWaiting only runs on success.
  event.waitUntil(install().then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(activate())
})

/** `/about/` and `/about` are the same page. */
function normalize(pathname) {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

async function fromShell(url, request) {
  const cache = await caches.open(SHELL_CACHE)
  // The room keeps its whole state in the query string, so a page is a page
  // whatever follows the `?`.
  return (await cache.match(url, { ignoreSearch: true })) || fetch(request)
}

/**
 * A board page (HB-153): not precached, so the network serves it whenever it
 * can. Offline, the cached room stands in — it is the same document with its
 * own head, and the room reads the board from the path (ADR-0009 §6).
 */
async function board(request) {
  try {
    return await fetch(request)
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE)
    const room = await cache.match(normalize(MANIFEST.base), { ignoreSearch: true })
    if (room) return room
    throw err
  }
}

async function sample(request, pathname) {
  const cache = await caches.open(SAMPLES.name)
  const key = sampleKey(pathname)
  const hit = await cache.match(key)
  if (hit) return hit
  const response = await fetch(request)
  // 200 only: a partial (206) or an error must not be remembered as the file.
  if (response.status === 200) await cache.put(key, response.clone())
  return response
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Anything not ours (the Ko-fi link target, a CDN we don't use) and anything
  // we don't list (apple-app-site-association, robots.txt, sitemap.xml) is left
  // to the browser, as if there were no worker at all.
  if (url.origin !== self.location.origin) return

  const path = normalize(url.pathname)

  if (request.mode === 'navigate') {
    if (PAGES.has(path)) event.respondWith(fromShell(path, request))
    else if (BOARDS.has(path)) event.respondWith(board(request))
    return
  }
  if (SHELL.has(path)) {
    event.respondWith(fromShell(path, request))
    return
  }
  if (path.startsWith(SAMPLES.prefix)) {
    event.respondWith(sample(request, path))
  }
})
