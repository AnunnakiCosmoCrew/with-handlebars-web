import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The plugin stands in for @capacitor/haptics, which only exists in the app. */
const impact = vi.fn(async () => {})
const notification = vi.fn(async () => {})

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact, notification },
  ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}))

/** Stand in for the bridge Capacitor injects at document start. */
const stubNativeShell = () => {
  Object.assign(window, {
    Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  })
}

/**
 * A fresh copy of the module per test: its enabled flag is read from storage at
 * import time, and its plugin promise is cached for the life of the module.
 */
async function loadHaptics() {
  vi.resetModules()
  return import('../src/lib/haptics.js')
}

/** Let the fire-and-forget promise chain inside `fire()` settle. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  localStorage.clear()
  impact.mockClear()
  notification.mockClear()
})

afterEach(() => {
  Reflect.deleteProperty(window, 'Capacitor')
  Reflect.deleteProperty(window, 'webkit')
})

describe('haptics', () => {
  it('stays silent on the website, and never loads the plugin there', async () => {
    const { haptics, hapticsAvailable } = await loadHaptics()
    expect(hapticsAvailable()).toBe(false)

    haptics.right()
    haptics.wrong()
    haptics.accent()
    await settled()

    // Not just "no buzz": the import must not run at all, because
    // @capacitor/core assigns window.Capacitor wherever it loads.
    expect(notification).not.toHaveBeenCalled()
    expect(impact).not.toHaveBeenCalled()
    expect('Capacitor' in window).toBe(false)
  })

  it('buzzes right and wrong answers differently inside the app', async () => {
    stubNativeShell()
    const { haptics } = await loadHaptics()

    haptics.right()
    await settled()
    expect(notification).toHaveBeenCalledWith({ type: 'SUCCESS' })

    haptics.wrong()
    await settled()
    // Warning, not Error: you missed a note, nothing broke.
    expect(notification).toHaveBeenLastCalledWith({ type: 'WARNING' })
  })

  it('taps the downbeat lightly — it can land once a bar for minutes', async () => {
    stubNativeShell()
    const { haptics } = await loadHaptics()

    haptics.accent()
    await settled()
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' })
  })

  it('stays silent when the preference is off', async () => {
    stubNativeShell()
    const { haptics, hapticsEnabled } = await loadHaptics()
    hapticsEnabled.value = false

    haptics.right()
    haptics.accent()
    await settled()

    expect(notification).not.toHaveBeenCalled()
    expect(impact).not.toHaveBeenCalled()
  })

  it('is on by default and remembers being turned off', async () => {
    const first = await loadHaptics()
    expect(first.hapticsEnabled.value).toBe(true)

    first.hapticsEnabled.value = false
    await settled()
    expect(localStorage.getItem('handlebars.haptics.v1')).toBe('off')

    // Its own key, not the room's: a device preference must not ride along in
    // a shared permalink.
    expect(localStorage.getItem('handlebars.guitar-advanced.v1')).toBeNull()

    const second = await loadHaptics()
    expect(second.hapticsEnabled.value).toBe(false)
  })

  it('turns back on again', async () => {
    const { hapticsEnabled } = await loadHaptics()
    hapticsEnabled.value = false
    await settled()
    hapticsEnabled.value = true
    await settled()
    expect(localStorage.getItem('handlebars.haptics.v1')).toBe('on')
  })

  it('swallows a plugin that rejects, so an answer still lands', async () => {
    stubNativeShell()
    notification.mockRejectedValueOnce(new Error('no Taptic Engine'))
    const { haptics } = await loadHaptics()

    expect(() => haptics.right()).not.toThrow()
    await settled()
  })
})
