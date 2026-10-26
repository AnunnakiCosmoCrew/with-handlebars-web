// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import config from '../vite.config'
import { INSTRUMENTS } from '../src/audio/engine.js'
import { DEFAULT_STATE } from '../src/lib/url-state.js'
import { registerServiceWorker } from '../src/lib/service-worker.js'
import { PRECACHED_SAMPLES, PUBLIC_SHELL, renderWorker, type WorkerInputs } from '../tools/service-worker-plugin.js'

/**
 * HB-93 / ADR-0008. The worker exists so Chrome on Android offers "Install
 * app" and so a cold start with no network opens the room. Most of what can go
 * wrong is silent — a stale shell, a page answered with the wrong file, the
 * worker leaking into the iOS app — so the behaviour is pinned here against the
 * real template, with fakes standing in for the browser's Cache Storage.
 */

const root = process.cwd()
const template = readFileSync(join(root, 'service-worker/sw.js'), 'utf8')
const ORIGIN = 'https://h.test'

const bytes = (s: string) => new TextEncoder().encode(s)

function inputs(overrides: Partial<WorkerInputs> = {}): WorkerInputs {
  return {
    base: '/',
    emitted: new Map<string, string | Uint8Array>([
      ['index.html', '<html>room</html>'],
      ['about.html', '<html>about</html>'],
      ['privacy.html', '<html>privacy</html>'],
      ['assets/main-AAA.js', 'js'],
      ['assets/main-AAA.css', 'css'],
      ['assets/main-AAA.js.map', 'map'],
      ['sw.js', 'itself'],
    ]),
    publicShell: new Map(PUBLIC_SHELL.map(f => [f, bytes(f)])),
    samples: new Map(PRECACHED_SAMPLES.map(f => [f, bytes(f)])),
    ...overrides,
  }
}

describe('renderWorker — what the build tells the worker', () => {
  const out = renderWorker(template, inputs())
  const read = (name: string) => {
    // The three constants are JSON, so pull each back out of the rendered source.
    const m = new RegExp(`const ${name} = (.+?)\\n(?:/\\*\\*|const |$)`, 's').exec(out)
    return JSON.parse(m![1]!)
  }

  it('leaves no token behind', () => {
    expect(out).not.toMatch(/__(MANIFEST|BUILD|SAMPLES)__ *\n/)
  })

  it('lists the pages by the clean URL they are navigated to', () => {
    expect(read('MANIFEST').pages.sort()).toEqual(['/', '/about', '/privacy'])
  })

  it('keeps the 404 page out of the pages and the shell, so an unknown path is never answered from cache', () => {
    const withNotFound = new Map(inputs().emitted).set('404.html', '<html>nope</html>')
    const m = JSON.parse(
      /const MANIFEST = (.+?)\n(?:\/\*\*|const |$)/s.exec(renderWorker(template, inputs({ emitted: withNotFound })))![1]!,
    )
    expect(m.pages).not.toContain('/404')
    expect(m.pages).not.toContain('/404.html')
    expect(m.shell).not.toContain('/404.html')
  })

  it('keeps the generated board pages and the sitemap out of the precache (HB-153, ADR-0009 §6)', () => {
    const withBoards = new Map(inputs().emitted)
      .set('standard/a/chord/minor-7/index.html', '<html>Am7</html>')
      .set('sitemap.xml', '<urlset/>')
    const m = JSON.parse(
      /const MANIFEST = (.+?)\n(?:\/\*\*|const |$)/s.exec(renderWorker(template, inputs({ emitted: withBoards })))![1]!,
    )
    expect(m.pages.sort()).toEqual(['/', '/about', '/privacy'])
    expect(m.shell.filter((u: string) => u.includes('standard') || u.includes('sitemap'))).toEqual([])
    // Listed by URL instead, for the offline fallback below.
    expect(m.boards).toEqual(['/standard/a/chord/minor-7/'])
  })

  it('puts every emitted asset and the public shell in the shell, and nothing else', () => {
    const { shell } = read('MANIFEST')
    expect(shell).toContain('/assets/main-AAA.js')
    expect(shell).toContain('/assets/main-AAA.css')
    expect(shell).toContain('/site.webmanifest')
    // not itself, not sourcemaps, not the pages under their file names
    expect(shell).not.toContain('/sw.js')
    expect(shell).not.toContain('/assets/main-AAA.js.map')
    expect(shell).not.toContain('/index.html')
  })

  it('honours a non-root base', () => {
    const rendered = renderWorker(template, inputs({ base: '/hb/' }))
    expect(rendered).toContain('"/hb/about"')
    expect(rendered).toContain('"/hb/assets/main-AAA.js"')
    expect(rendered).toContain('"prefix": "/hb/soundfonts/"')
  })

  it('versions the shell by content, and the samples separately', () => {
    const build = (o: Partial<WorkerInputs>) => renderWorker(template, inputs(o))
    const grab = (s: string, re: RegExp) => re.exec(s)![1]
    const shellOf = (s: string) => grab(s, /const BUILD = "(\w+)"/)
    const samplesOf = (s: string) => grab(s, /"versions": (\{[^}]*\})/)

    const base = build({})
    const emitted = new Map(inputs().emitted).set('index.html', '<html>room, edited</html>')
    const codeChanged = build({ emitted })
    expect(shellOf(codeChanged)).not.toBe(shellOf(base))
    // a code deploy must not make every phone download the guitar again
    expect(samplesOf(codeChanged)).toBe(samplesOf(base))

    const samples = new Map([[PRECACHED_SAMPLES[0]!, bytes('a different recording')]])
    const sampleChanged = build({ samples })
    expect(samplesOf(sampleChanged)).not.toBe(samplesOf(base))
    expect(shellOf(sampleChanged)).toBe(shellOf(base))
  })

  it('versions each sample on its own, so editing one instrument leaves the others’ keys alone', () => {
    const two = (b: string) =>
      new Map([
        [PRECACHED_SAMPLES[0]!, bytes('guitar')],
        ['other-ogg.js', bytes(b)],
      ])
    const versions = (m: Map<string, Uint8Array>) =>
      JSON.parse(/"versions": (\{[^}]*\})/.exec(renderWorker(template, inputs({ samples: m })))![1]!)
    const before = versions(two('jazz'))
    const after = versions(two('jazz, remastered'))
    expect(after['/soundfonts/other-ogg.js']).not.toBe(before['/soundfonts/other-ogg.js'])
    expect(after[`/soundfonts/${PRECACHED_SAMPLES[0]}`]).toBe(before[`/soundfonts/${PRECACHED_SAMPLES[0]}`])
  })

  it('is registered on the real build', () => {
    expect(config.plugins?.flat().some(p => p && 'name' in p && p.name === 'handlebars-service-worker')).toBe(true)
  })
})

describe('the sources the worker relies on', () => {
  it('only precaches public files that exist', () => {
    for (const f of PUBLIC_SHELL) expect(existsSync(join(root, 'public', f)), f).toBe(true)
  })

  it('precaches only the default instrument — the other three are cached when first played', () => {
    const def = INSTRUMENTS.find(i => i.id === DEFAULT_STATE.instrument)!
    expect(PRECACHED_SAMPLES).toEqual([`${def.soundfont}-ogg.js`])
    for (const f of PRECACHED_SAMPLES) expect(existsSync(join(root, 'public/soundfonts', f)), f).toBe(true)
  })

  it('never answers for the files that are not ours to answer for', () => {
    for (const f of ['_headers', 'robots.txt', 'sitemap.xml']) expect(PUBLIC_SHELL).not.toContain(f)
    expect(PUBLIC_SHELL.every(f => !f.startsWith('.'))).toBe(true)
  })

  it('names no remote host — the worker adds no network layer (offline parity)', () => {
    expect(template).not.toMatch(/https?:\/\//i)
  })

  it('serves sw.js uncached', () => {
    expect(readFileSync(join(root, 'public/_headers'), 'utf8')).toMatch(/^\/sw\.js\n\s+Cache-Control: no-cache$/m)
  })
})

/* ---- the worker itself, run against fakes ---------------------------------------------------- */

type Handler = (event: any) => void

function boot(
  opts: { shell?: string; samples?: string; stored?: Record<string, string[]>; inputs?: Partial<WorkerInputs> } = {},
) {
  const handlers: Record<string, Handler> = {}
  const stores = new Map<string, Map<string, Response>>()
  const path = (x: string | { url: string }) => new URL(typeof x === 'string' ? x : x.url, ORIGIN).pathname
  const keyOf = (x: string | { url: string }) => {
    const u = new URL(typeof x === 'string' ? x : x.url, ORIGIN)
    return u.pathname + u.search
  }
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    return stores.get(name)!
  }
  for (const [name, urls] of Object.entries(opts.stored ?? {})) {
    for (const u of urls) open(name).set(u, new Response('old'))
  }
  const caches = {
    open: async (name: string) => {
      const s = open(name)
      return {
        match: async (x: any, o: { ignoreSearch?: boolean } = {}) =>
          s.get(o.ignoreSearch ? path(x) : keyOf(x))?.clone(),
        put: async (x: any, r: Response) => void s.set(keyOf(x), r),
        keys: async () => [...s.keys()].map(k => ({ url: new URL(k, ORIGIN).href })),
        delete: async (x: any) => s.delete(keyOf(x)),
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  }
  const network: string[] = []
  const online = { value: true }
  const fetchFn = vi.fn(async (x: any) => {
    network.push(path(x))
    if (!online.value) throw new TypeError('Failed to fetch')
    return new Response(`net:${path(x)}`, { status: 200 })
  })
  class FakeRequest {
    url: string
    constructor(url: string, init: object = {}) {
      this.url = new URL(url, ORIGIN).href
      Object.assign(this, init)
    }
  }
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
  }
  const code = renderWorker(template, inputs(opts.inputs))
  new Function('self', 'caches', 'fetch', 'Request', 'Response', 'URL', code)(
    self,
    caches,
    fetchFn,
    FakeRequest,
    Response,
    URL,
  )

  const names = () => [...stores.keys()]
  const dispatch = (type: string) => {
    const event: any = { waitUntil: (p: Promise<unknown>) => (event.done = p) }
    handlers[type]!(event)
    return event.done as Promise<void>
  }
  /** Fire a fetch event; resolves to the body served, or null when the worker declined to answer. */
  const request = async (url: string, init: { method?: string; mode?: string } = {}) => {
    let served = null as Promise<Response> | null
    const event = {
      request: { method: 'GET', mode: 'cors', ...init, url: new URL(url, ORIGIN).href },
      respondWith: (p: Promise<Response>) => (served = p),
    }
    handlers['fetch']!(event)
    return served ? await (await (served as Promise<Response>)).text() : null
  }
  return { self, stores, names, network, online, dispatch, request, fetchFn }
}

/** The content hash the build gave the default instrument, read back out of the rendered worker. */
const guitarVersion = () =>
  JSON.parse(/"versions": (\{[^}]*\})/.exec(renderWorker(template, inputs()))![1]!)[`/soundfonts/${PRECACHED_SAMPLES[0]}`]

describe('the worker — install and update', () => {
  it('precaches the whole shell and the default instrument, then takes over', async () => {
    const w = boot()
    await w.dispatch('install')
    const shellName = w.names().find(n => n.startsWith('hb-shell-'))!
    const shell = [...w.stores.get(shellName)!.keys()].sort()
    expect(shell).toEqual(
      ['/', '/about', '/privacy', '/assets/main-AAA.js', '/assets/main-AAA.css', ...PUBLIC_SHELL.map(f => `/${f}`)].sort(),
    )
    expect([...w.stores.get('hb-samples')!.keys()]).toEqual([`/soundfonts/${PRECACHED_SAMPLES[0]}?v=${guitarVersion()}`])
    expect(w.self.skipWaiting).toHaveBeenCalledOnce()
  })

  it('on activate, drops the cached copy of a sample whose file has changed, and keeps the rest', async () => {
    const guitar = `/soundfonts/${PRECACHED_SAMPLES[0]}?v=${guitarVersion()}`
    const w = boot({ stored: { 'hb-samples': [guitar, `/soundfonts/${PRECACHED_SAMPLES[0]}?v=stale`] } })
    await w.dispatch('install')
    await w.dispatch('activate')
    expect([...w.stores.get('hb-samples')!.keys()]).toEqual([guitar])
  })

  it('does not take over if any file fails to download — the old worker keeps the page', async () => {
    const w = boot()
    w.fetchFn.mockImplementation(async (x: any) =>
      new URL(x.url).pathname === '/about' ? new Response('nope', { status: 500 }) : new Response('ok'),
    )
    await expect(w.dispatch('install')).rejects.toThrow(/about/)
    expect(w.self.skipWaiting).not.toHaveBeenCalled()
  })

  it('skips the HTTP cache when downloading, so one build is never assembled from two', async () => {
    const w = boot()
    await w.dispatch('install')
    expect(w.fetchFn.mock.calls.every(([r]) => (r as any).cache === 'reload')).toBe(true)
  })

  it('does not download samples it already holds', async () => {
    const w = boot({ stored: { 'hb-samples': [`/soundfonts/${PRECACHED_SAMPLES[0]}?v=${guitarVersion()}`] } })
    await w.dispatch('install')
    expect(w.network).not.toContain(`/soundfonts/${PRECACHED_SAMPLES[0]}`)
  })

  it('on activate, drops other builds’ caches and keeps its own, and claims open pages', async () => {
    const w = boot({
      stored: { 'hb-shell-old': ['/'], 'hb-samples-old': ['/x'], 'unrelated-cache': ['/y'] },
    })
    await w.dispatch('install')
    await w.dispatch('activate')
    expect(w.names().some(n => n === 'hb-shell-old' || n === 'hb-samples-old')).toBe(false)
    expect(w.names()).toContain('unrelated-cache') // not ours, not touched
    expect(w.names().filter(n => n.startsWith('hb-shell-'))).toHaveLength(1)
    expect(w.self.clients.claim).toHaveBeenCalledOnce()
  })
})

describe('the worker — answering requests', () => {
  const ready = async () => {
    const w = boot()
    await w.dispatch('install')
    w.network.length = 0
    return w
  }

  it('serves a known page from the cache whatever its query string says', async () => {
    const w = await ready()
    expect(await w.request('/?m=chord&r=E', { mode: 'navigate' })).toBe('net:/')
    // body is whatever install fetched for "/" — the point is that no new request went out
    expect(w.network).toEqual([])
  })

  it('treats /about/ and /about as the same page', async () => {
    const w = await ready()
    expect(await w.request('/about/', { mode: 'navigate' })).toBe('net:/about')
    expect(w.network).toEqual([])
  })

  it('finds the room again under a non-root base, where its URL ends in a slash', async () => {
    const w = boot({ inputs: { base: '/hb/' } })
    await w.dispatch('install')
    w.network.length = 0
    expect(await w.request('/hb/', { mode: 'navigate' })).toBe('net:/hb/')
    expect(await w.request('/hb/about/', { mode: 'navigate' })).toBe('net:/hb/about')
    expect(w.network).toEqual([])
  })

  it('leaves an unknown navigation to the network instead of answering with the room', async () => {
    const w = await ready()
    expect(await w.request('/no-such-page', { mode: 'navigate' })).toBeNull()
  })

  describe('a board page (HB-153)', () => {
    const withBoard = async () => {
      const emitted = new Map(inputs().emitted).set('standard/a/chord/minor-7/index.html', '<html>Am7</html>')
      const w = boot({ inputs: { emitted } })
      await w.dispatch('install')
      w.network.length = 0
      return w
    }

    it('is fetched from the network while there is one, never precached', async () => {
      const w = await withBoard()
      expect(w.stores.get([...w.stores.keys()].find(n => n.startsWith('hb-shell-'))!)!.has('/standard/a/chord/minor-7')).toBe(false)
      expect(await w.request('/standard/a/chord/minor-7/?octaves=on', { mode: 'navigate' })).toBe(
        'net:/standard/a/chord/minor-7/',
      )
    })

    it('opens as the cached room offline, with or without its trailing slash', async () => {
      const w = await withBoard()
      w.online.value = false
      // The body is whatever install fetched for "/": the room's own document.
      expect(await w.request('/standard/a/chord/minor-7/', { mode: 'navigate' })).toBe('net:/')
      expect(await w.request('/standard/a/chord/minor-7', { mode: 'navigate' })).toBe('net:/')
    })

    it('leaves a board path the build did not write to the network', async () => {
      const w = await withBoard()
      expect(await w.request('/standard/a/chord/minor-11/', { mode: 'navigate' })).toBeNull()
    })
  })

  it('serves shell assets from the cache', async () => {
    const w = await ready()
    expect(await w.request('/assets/main-AAA.js')).toBe('net:/assets/main-AAA.js')
    expect(w.network).toEqual([])
  })

  it('caches a sample the first time it is played, then serves it without the network', async () => {
    const w = await ready()
    const url = '/soundfonts/acoustic_guitar_steel-ogg.js'
    expect(await w.request(url)).toBe(`net:${url}`)
    expect(w.network).toEqual([url])
    expect(await w.request(url)).toBe(`net:${url}`)
    expect(w.network).toEqual([url]) // second time: cache
  })

  it('does not remember a failed or partial sample as the file', async () => {
    const w = await ready()
    const url = '/soundfonts/electric_guitar_clean-ogg.js'
    w.fetchFn.mockResolvedValueOnce(new Response('partial', { status: 206 }))
    const samples = w.stores.get('hb-samples')!
    await w.request(url) // the 206
    expect(samples.has(url)).toBe(false)
    await w.request(url) // a real 200 this time
    expect(samples.get(url)?.status).toBe(200)
  })

  it.each([
    ['a POST', '/', { method: 'POST' }],
    ['another origin', 'https://cdn.example/assets/main-AAA.js', {}],
    ['apple-app-site-association', '/.well-known/apple-app-site-association', {}],
    ['robots.txt', '/robots.txt', {}],
    ['a file it does not list', '/assets/other.js', {}],
  ])('passes %s straight through', async (_label, url, init) => {
    const w = await ready()
    expect(await w.request(url, init)).toBeNull()
  })
})

/* ---- registration ---------------------------------------------------------------------------- */

function fakeEnv(over: { production?: boolean; platform?: 'web' | 'ios' | 'android'; controller?: boolean; support?: boolean; ready?: boolean } = {}) {
  const listeners: Record<string, Handler> = {}
  const register = vi.fn(async () => ({ update: vi.fn(async () => {}) }))
  const container = {
    controller: over.controller ? {} : null,
    addEventListener: (t: string, fn: Handler) => void (listeners[t] = fn),
    register,
  }
  const win: any = {
    location: { reload: vi.fn() },
    document: { readyState: over.ready === false ? 'loading' : 'complete', addEventListener: vi.fn(), visibilityState: 'visible' },
    addEventListener: (t: string, fn: Handler) => void (win._l[t] = fn),
    _l: {} as Record<string, Handler>,
  }
  const nav: any = over.support === false ? {} : { serviceWorker: container }
  return {
    register,
    listeners,
    win,
    run: () =>
      registerServiceWorker({
        production: over.production ?? true,
        platform: over.platform ?? 'web',
        base: '/',
        navigator: nav,
        window: win,
      }),
  }
}

describe('registerServiceWorker', () => {
  it('registers /sw.js at the site scope, bypassing the HTTP cache for updates', () => {
    const e = fakeEnv()
    expect(e.run()).toBe(true)
    expect(e.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
  })

  it('waits for load so cache-filling never competes with the first paint', () => {
    const e = fakeEnv({ ready: false })
    e.run()
    expect(e.register).not.toHaveBeenCalled()
    e.win._l['load']()
    expect(e.register).toHaveBeenCalledOnce()
  })

  it.each([
    ['under the dev server', { production: false }],
    ['inside the iOS app', { platform: 'ios' as const }],
    ['inside an Android shell', { platform: 'android' as const }],
    ['where the browser has no service workers', { support: false }],
  ])('does nothing %s', (_label, over) => {
    const e = fakeEnv(over)
    expect(e.run()).toBe(false)
    expect(e.register).not.toHaveBeenCalled()
  })

  it('reloads onto the new build when a worker replaces one that was already in charge', () => {
    const e = fakeEnv({ controller: true })
    e.run()
    e.listeners['controllerchange']!({})
    e.listeners['controllerchange']!({})
    expect(e.win.location.reload).toHaveBeenCalledOnce()
  })

  it('does not reload on the very first install — nothing visible changed', () => {
    const e = fakeEnv({ controller: false })
    e.run()
    e.listeners['controllerchange']!({})
    expect(e.win.location.reload).not.toHaveBeenCalled()
  })
})
