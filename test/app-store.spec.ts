import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mainTs from '../src/main.ts?raw'
import {
  APP_STORE_URL,
  REDIRECTED_KEY,
  isIPhoneBrowser,
  redirectFirstIPhoneVisit,
} from '../src/lib/app-store.js'

/**
 * HB-147: the first time an iPhone opens the bare room, it goes to the App
 * Store. Everything else stays on the site: later visits, shared boards, other
 * devices, and above all the app itself, whose WKWebView also says "iPhone".
 */
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPAD_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

const useAgent = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)

/** A window with just what the redirect reads, so nothing actually navigates. */
const fakeWindow = (pathname = '/', search = '') => {
  const assign = vi.fn()
  const win = { location: { pathname, search, assign }, localStorage } as unknown as Window
  return { win, assign }
}

beforeEach(() => localStorage.clear())

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'Capacitor')
})

describe('isIPhoneBrowser', () => {
  it('is true for an iPhone browser', () => {
    useAgent(IPHONE_SAFARI)
    expect(isIPhoneBrowser()).toBe(true)
  })

  it('is false inside the app, though its user agent says iPhone too', () => {
    useAgent(IPHONE_SAFARI)
    Object.assign(window, { Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true } })
    expect(isIPhoneBrowser()).toBe(false)
  })

  it('leaves iPad (which reports a Mac), Android and desktop alone', () => {
    for (const ua of [IPAD_SAFARI, ANDROID_CHROME]) {
      useAgent(ua)
      expect(isIPhoneBrowser()).toBe(false)
    }
  })
})

describe('redirectFirstIPhoneVisit', () => {
  it('sends a first iPhone visit to the bare room to the listing, and remembers it', () => {
    useAgent(IPHONE_SAFARI)
    const { win, assign } = fakeWindow()
    expect(redirectFirstIPhoneVisit(win)).toBe(true)
    // assign, not replace: Safari's Back button has to return to the site.
    expect(assign).toHaveBeenCalledWith(APP_STORE_URL)
    expect(localStorage.getItem(REDIRECTED_KEY)).not.toBeNull()
  })

  it('fires once per device', () => {
    useAgent(IPHONE_SAFARI)
    redirectFirstIPhoneVisit(fakeWindow().win)
    const { win, assign } = fakeWindow()
    expect(redirectFirstIPhoneVisit(win)).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('never takes a shared board away from a friend without the app', () => {
    useAgent(IPHONE_SAFARI)
    const { win, assign } = fakeWindow('/', '?root=A&type=minor')
    expect(redirectFirstIPhoneVisit(win)).toBe(false)
    expect(assign).not.toHaveBeenCalled()
    // ...and spends nothing doing so: the next bare visit still redirects.
    expect(localStorage.getItem(REDIRECTED_KEY)).toBeNull()
  })

  it('counts /index.html as the bare room and other paths as not', () => {
    useAgent(IPHONE_SAFARI)
    expect(redirectFirstIPhoneVisit(fakeWindow('/about').win)).toBe(false)
    expect(redirectFirstIPhoneVisit(fakeWindow('/index.html').win)).toBe(true)
  })

  it('does nothing inside the app', () => {
    useAgent(IPHONE_SAFARI)
    Object.assign(window, { Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true } })
    const { win, assign } = fakeWindow()
    expect(redirectFirstIPhoneVisit(win)).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('does nothing off the iPhone', () => {
    for (const ua of [IPAD_SAFARI, ANDROID_CHROME]) {
      useAgent(ua)
      const { win, assign } = fakeWindow()
      expect(redirectFirstIPhoneVisit(win)).toBe(false)
      expect(assign).not.toHaveBeenCalled()
    }
  })

  it('does nothing when it cannot remember, rather than redirecting every visit', () => {
    useAgent(IPHONE_SAFARI)
    const assign = vi.fn()
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    }
    const win = { location: { pathname: '/', search: '', assign }, localStorage: blocked } as unknown as Window
    expect(redirectFirstIPhoneVisit(win)).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('runs before the app mounts, while the URL is still the one the visitor arrived with', () => {
    // The room store writes its state into the query as it starts, which would
    // make every bare visit look like a shared board.
    const call = mainTs.indexOf('redirectFirstIPhoneVisit()')
    expect(call).toBeGreaterThan(-1)
    expect(call).toBeLessThan(mainTs.indexOf('createApp('))
  })
})
