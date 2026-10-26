import { isNativeApp } from './platform.js'

/**
 * Pointing iPhone visitors at the app (HB-147). Two pieces, both website-only:
 *
 * - a one-time redirect: the first time an iPhone opens the bare room, it goes
 *   to the App Store listing;
 * - a badge in the room's header, top right, on every iPhone visit after that.
 *
 * Inside the app neither may happen: the WKWebView's user agent says "iPhone"
 * too, and the listing would point the app at itself. So both ask
 * `isNativeApp()` first.
 */
export const APP_STORE_URL = 'https://apps.apple.com/app/with-handlebars/id6815550767'

/** Set once the redirect has fired, so it fires once per device. */
export const REDIRECTED_KEY = 'hb-app-store-redirected'

/**
 * An iPhone browser: Safari, or any other iOS browser or in-app viewer, since
 * they all report the same device. iPad is left out on purpose: iPadOS Safari
 * reports itself as a Mac, and the founder asked for iPhone.
 */
export function isIPhoneBrowser(): boolean {
  if (typeof navigator === 'undefined' || isNativeApp()) return false
  return /\b(iPhone|iPod)\b/.test(navigator.userAgent)
}

/**
 * Only the bare room redirects. A shared board is `/` with its state in the
 * query, and a friend without the app must still get the chords they were sent;
 * About and Privacy are separate pages that ship no module, so they never get here.
 */
function isBareRoom(location: Location): boolean {
  return (location.pathname === '/' || location.pathname === '/index.html') && location.search === ''
}

/**
 * Send a first-time iPhone visitor to the App Store. Returns whether it did.
 *
 * When storage cannot be read or written, it does nothing: without a place to
 * remember the redirect, it would fire on every visit and the site would be
 * unusable on that phone. A normal navigation, not `replace`, so Safari's Back
 * button returns to the site.
 */
export function redirectFirstIPhoneVisit(win: Window = window): boolean {
  if (!isIPhoneBrowser() || !isBareRoom(win.location)) return false
  try {
    if (win.localStorage.getItem(REDIRECTED_KEY) !== null) return false
    win.localStorage.setItem(REDIRECTED_KEY, new Date().toISOString())
  } catch {
    return false
  }
  win.location.assign(APP_STORE_URL)
  return true
}
