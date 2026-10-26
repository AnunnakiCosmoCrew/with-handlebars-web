/**
 * Which shell the page is running in. One `dist` serves both the website and
 * the iOS app (ADR-0003), so this is a runtime question: there is no build
 * flag and no second bundle to hang it on.
 */
export type Platform = 'web' | 'ios' | 'android'

/** The shape of the bridge the native shell injects. We read it; we never build it. */
type CapacitorBridge = {
  getPlatform?: () => string
  isNativePlatform?: () => boolean
}

type BridgedWindow = Window & {
  Capacitor?: CapacitorBridge
  androidBridge?: unknown
  webkit?: { messageHandlers?: { bridge?: unknown } }
}

/**
 * Read the platform off the bridge the native shell injects into the WKWebView
 * at document start — so it is answerable before the first paint, on every page
 * of the bundle, not only the one the app launches into.
 *
 * We read `window.Capacitor` rather than importing `@capacitor/core` on purpose,
 * even though the bundle now carries core anyway for the keep-awake plugin
 * (HB-46). Reading the globals is what makes this check answerable at document
 * start on every page of the bundle, and identical to the one `about.html`
 * inlines, since a page of prose ships no module (ADR-0001) — neither of which
 * an import would give us.
 *
 * Note what core does on the plain website: it *assigns* `window.Capacitor` as
 * its web shim, whose `getPlatform()` is `'web'` and whose `isNativePlatform()`
 * is `false`. So the presence of the global proves nothing on its own, and the
 * answers below stay right. `test/platform.spec.ts` pins that, because the
 * Ko-fi pill and the "Data Not Collected" label both hang off it.
 */
export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web'
  const win = window as BridgedWindow
  const named = win.Capacitor?.getPlatform?.()
  if (named === 'ios' || named === 'android') return named
  // Fall back to the structural signals Capacitor itself sniffs, so a bridge
  // whose JS API changed still reads as native instead of silently as the site.
  if (win.androidBridge) return 'android'
  if (win.webkit?.messageHandlers?.bridge) return 'ios'
  return 'web'
}

/**
 * True inside the shipped app. Web-only chrome must ask this before it renders:
 * the Ko-fi pill today (ADR-0003 — an external donation link is a well-worn App
 * Store rejection under Guideline 3.1.1), and the PWA install prompt when HB-67
 * adds one. Analytics, if it ever exists, is the same rule.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  if (getPlatform() !== 'web') return true
  // A bridge we could not name still counts as native. The asymmetry is
  // deliberate: rendering the pill inside the app is the expensive mistake,
  // hiding it on some platform we failed to name is not.
  return (window as BridgedWindow).Capacitor?.isNativePlatform?.() === true
}

/**
 * True where the primary pointer is a finger. Autofocusing a text field on such
 * a device *is* a keyboard: opening the scale or tuning picker raised it over
 * the list the user was trying to read (HB-83, UX-03).
 *
 * Answers false when it cannot tell — no `matchMedia`, or a query it refuses to
 * parse. The asymmetry is the opposite of `isNativeApp()`'s and deliberate: a
 * keyboard that appears unasked on a phone costs the user half the screen, while
 * a search box that does not autofocus on a desktop costs one keystroke.
 */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}
