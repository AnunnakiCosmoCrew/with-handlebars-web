import { afterEach, describe, expect, it } from 'vitest'
import { getPlatform, isCoarsePointer, isNativeApp } from '../src/lib/platform.js'

/** Stand in for the bridge Capacitor injects at document start. */
const stubBridge = (bridge: Record<string, unknown>) => {
  Object.assign(window, { Capacitor: bridge })
}

afterEach(() => {
  Reflect.deleteProperty(window, 'Capacitor')
  Reflect.deleteProperty(window, 'webkit')
  Reflect.deleteProperty(window, 'androidBridge')
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('platform detection', () => {
  it('reads a bare browser as the website', () => {
    expect(getPlatform()).toBe('web')
    expect(isNativeApp()).toBe(false)
  })

  it('reads the shipped iOS shell off the injected bridge', () => {
    stubBridge({ getPlatform: () => 'ios', isNativePlatform: () => true })
    expect(getPlatform()).toBe('ios')
    expect(isNativeApp()).toBe(true)
  })

  it('names Android too, so the union stays honest', () => {
    stubBridge({ getPlatform: () => 'android', isNativePlatform: () => true })
    expect(getPlatform()).toBe('android')
    expect(isNativeApp()).toBe(true)
  })

  it('falls back to the WKWebView message handler when the bridge API changed', () => {
    Object.assign(window, { webkit: { messageHandlers: { bridge: {} } } })
    expect(getPlatform()).toBe('ios')
    expect(isNativeApp()).toBe(true)
  })

  it('falls back to the Android bridge the same way', () => {
    Object.assign(window, { androidBridge: {} })
    expect(getPlatform()).toBe('android')
    expect(isNativeApp()).toBe(true)
  })

  it('counts an unnameable native bridge as native', () => {
    // Deliberately asymmetric: we would rather hide the pill on a platform we
    // failed to name than render it inside the app.
    stubBridge({ isNativePlatform: () => true })
    expect(getPlatform()).toBe('web')
    expect(isNativeApp()).toBe(true)
  })

  it('is not fooled by a bare Capacitor global on the website', () => {
    stubBridge({})
    expect(getPlatform()).toBe('web')
    expect(isNativeApp()).toBe(false)
  })

  it("is not fooled by @capacitor/core's own web shim", () => {
    // The bundle imports core for real now (HB-46, keep-awake), and core
    // assigns window.Capacitor on withhandlebars.com. This is the shape it
    // assigns there — the Ko-fi pill and the "Data Not Collected" label both
    // depend on it still reading as the website.
    stubBridge({ getPlatform: () => 'web', isNativePlatform: () => false })
    expect(getPlatform()).toBe('web')
    expect(isNativeApp()).toBe(false)
  })
})

describe('pointer coarseness', () => {
  it('reads a touch screen off the media query', () => {
    Object.assign(window, { matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' }) })
    expect(isCoarsePointer()).toBe(true)
  })

  it('reads a mouse as fine', () => {
    Object.assign(window, { matchMedia: () => ({ matches: false }) })
    expect(isCoarsePointer()).toBe(false)
  })

  it('says fine when it cannot tell', () => {
    // Asymmetric the other way round from isNativeApp(): an unasked keyboard
    // costs a phone user half the screen, a missing autofocus costs a desktop
    // user one keystroke. So an engine with no matchMedia, or one that refuses
    // the query, keeps the desktop behavior.
    Reflect.deleteProperty(window, 'matchMedia')
    expect(isCoarsePointer()).toBe(false)
    Object.assign(window, {
      matchMedia: () => {
        throw new SyntaxError('unsupported media feature')
      },
    })
    expect(isCoarsePointer()).toBe(false)
  })
})
