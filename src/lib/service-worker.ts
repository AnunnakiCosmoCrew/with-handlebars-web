import { getPlatform } from './platform.js'

type Environment = {
  /** `import.meta.env.PROD`: there is no sw.js under `vite dev`. */
  production: boolean
  platform: ReturnType<typeof getPlatform>
  base: string
  navigator: Navigator
  window: Window
}

/**
 * Register the site's service worker (HB-93, ADR-0008). Chrome on Android will
 * not offer "Install app" without one, and a cold start with no network opens
 * the room because of it.
 *
 * It stays out of the iOS app on purpose. The app is the same build in a
 * WKWebView that already ships every file inside the binary (ADR-0003), so a
 * worker there could only add a second copy that goes stale — and WKWebView
 * does not run workers for `capacitor://` pages anyway. Skipping it is what
 * guarantees the worker "must not change how the native shell loads".
 *
 * Returns whether registration was attempted, for the tests.
 */
export function registerServiceWorker(env?: Partial<Environment>): boolean {
  const e: Environment = {
    production: env?.production ?? import.meta.env.PROD,
    platform: env?.platform ?? getPlatform(),
    base: env?.base ?? import.meta.env.BASE_URL,
    navigator: env?.navigator ?? navigator,
    window: env?.window ?? window,
  }
  if (!e.production || e.platform !== 'web' || !('serviceWorker' in e.navigator)) return false

  const container = e.navigator.serviceWorker
  // A first visit has no controller: the worker claims the page and nothing
  // visible changes. A visit that *did* have one and then gets a new one means
  // a deploy has landed and the loaded page is the old build's, whose files the
  // new worker has already swapped out of the cache. Reload onto the new build:
  // the room keeps its whole state in the URL, so this costs nothing.
  const hadController = !!container.controller
  let reloading = false
  container.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    e.window.location.reload()
  })

  const register = () => {
    container
      .register(`${e.base}sw.js`, { scope: e.base, updateViaCache: 'none' })
      .then(registration => {
        // An installed app can stay open for days; ask for a new worker whenever
        // it comes back to the foreground, not only on a fresh navigation.
        e.window.document.addEventListener('visibilitychange', () => {
          if (e.window.document.visibilityState === 'visible') void registration.update().catch(() => {})
        })
      })
      // No worker is not an error the visitor can act on: the site works without.
      .catch(() => {})
  }
  // After load, so cache-filling never competes with the first paint.
  if (e.window.document.readyState === 'complete') register()
  else e.window.addEventListener('load', register, { once: true })
  return true
}
