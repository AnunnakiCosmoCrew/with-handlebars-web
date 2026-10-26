/**
 * External links, inside the app shell.
 *
 * One `dist` serves the website and the iOS app (ADR-0003), so every
 * `https://` link in the footer is also a link inside a WKWebView with no
 * chrome. Capacitor already refuses to navigate the shell off-origin — it
 * cancels and hands the URL to `UIApplication.open` — but that app-switches to
 * Safari and leaves the way back through the app switcher. A Safari View
 * Controller sheet is the iOS convention: it opens over the app and Done
 * returns the reader to the board exactly as they left it.
 *
 * Native-only by nature — a browser tab has no sheet to present, and a link on
 * the website should behave like a link — so this is the lazily-imported half
 * of ADR-0005, the same shape as `haptics.ts`: the plugin gets its own chunk
 * that the website never fetches, and no listener is attached there at all.
 *
 * `about.html` is where most of these links live and ships no module at all
 * (ADR-0001), so it carries the same rules inlined, reaching the plugin through
 * the injected bridge.
 */
import { isNativeApp } from './platform.js'

type BrowserModule = typeof import('@capacitor/browser')

/** The plugin, imported lazily and at most once — see the module comment. */
let loading: Promise<BrowserModule | null> | null = null

function load(): Promise<BrowserModule | null> {
  // A plugin that fails to load must not swallow the link with it.
  loading ??= import('@capacitor/browser').catch(() => null)
  return loading
}

/**
 * Does this href leave the app? Only absolute http(s) to another origin.
 *
 * `mailto:` is deliberately not ours: a Safari sheet cannot open it, and the
 * Mail app composing a message is the right answer anyway. Relative links and
 * same-origin absolutes are the app's own pages — `about.html` and the room —
 * and must navigate in place.
 */
export function opensOutsideTheApp(href: string | null, origin: string): boolean {
  if (!href) return false
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return url.origin !== origin
}

/**
 * Present the sheet. Not fire-and-forget like the other wrappers: we have
 * already called the navigation off by the time this runs, so a plugin that
 * never arrives has to hand the link back — `window.location` then leaves the
 * shell by Capacitor's own route. Worse, never dead.
 */
export function openInSafariSheet(url: string): void {
  void load()
    .then(async m => {
      if (!m) throw new Error('no Browser plugin')
      await m.Browser.open({ url })
    })
    .catch(() => {
      window.location.href = url
    })
}

/** The delegated click handler. Exported so the spec can drive it directly. */
export function handleExternalClick(event: MouseEvent): void {
  if (event.defaultPrevented) return
  // Not a plain primary click: let the platform do whatever it was asked to.
  // A falsy button covers both 0 and a plain Event that carries none.
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const anchor = nearestAnchor(event.target)
  if (!anchor) return
  const href = anchor.getAttribute('href')
  if (!opensOutsideTheApp(href, window.location.origin)) return
  event.preventDefault()
  openInSafariSheet(new URL(href as string, window.location.origin).href)
}

/**
 * The `<a>` a click landed in, if any. A click can be reported against a text
 * node — which has no `closest` — so climb to the nearest element first.
 */
function nearestAnchor(target: EventTarget | null): Element | null {
  let node = target as Node | null
  while (node && typeof (node as Element).closest !== 'function') node = node.parentNode
  return (node as Element | null)?.closest('a[href]') ?? null
}

/**
 * Listen once, on the document, for the life of the app — a link added later
 * is covered without anyone remembering to wire it. No-op on the website.
 * Returns the detach.
 */
export function attachExternalLinkHandler(target: Document = document): () => void {
  if (!isNativeApp()) return () => {}
  const listener = handleExternalClick as EventListener
  target.addEventListener('click', listener)
  return () => target.removeEventListener('click', listener)
}
