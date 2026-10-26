import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../src/App.vue'
import { getPlatform, isNativeApp } from '../src/lib/platform.js'
import { clearRoomState, nativeStub, reportPointerType, seedRandom } from '../src/shots/harness.js'

const realRandom = Math.random

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  Math.random = realRandom
  Reflect.deleteProperty(window, 'Capacitor')
  Reflect.deleteProperty(window, 'CapacitorCustomPlatform')
  Reflect.deleteProperty(document.documentElement.dataset, 'pointer')
})

describe('the screenshot page pretends to be the app', () => {
  it('reads as the iOS shell', () => {
    nativeStub()
    expect(getPlatform()).toBe('ios')
    expect(isNativeApp()).toBe(true)
  })

  // The whole reason the stub exists. A Ko-fi pill in an App Store screenshot
  // is an external donation link on the listing's front page — Guideline 3.1.1,
  // and exactly what ADR-0003 keeps out of the shell.
  it('renders no Ko-fi pill', () => {
    nativeStub()
    const w = mount(App, { global: { plugins: [createPinia()] } })
    expect(w.find('.site-footer-support').exists()).toBe(false)
    expect(w.find('.support-link').exists()).toBe(false)
  })

  // The stub's other half, and the reason it is not simply "hide the pill":
  // the practice panel's haptics toggle is native-only, and it is one of the
  // things a screenshot is there to show (Guideline 4.2 — not a wrapper).
  it('renders the haptics toggle the website never draws', () => {
    // Under the practice shot's own query: the toggle lives in the Beat
    // fieldset, which only exists while a practice mode is open.
    history.replaceState(null, '', '/?root=A&scale=pentatonic-minor&practice=quiz&pcard=show')
    nativeStub()
    const w = mount(App, { global: { plugins: [createPinia()] } })
    expect(w.find('[data-haptics]').exists()).toBe(true)
  })

  // Also names the global Capacitor's own core honours, so a future static
  // import of core cannot quietly overwrite the stub back to 'web'.
  it('names the platform in both places core would look', () => {
    nativeStub()
    const win = window as Window & {
      Capacitor?: { getPlatform?: () => string }
      CapacitorCustomPlatform?: { name: string }
    }
    expect(win.Capacitor?.getPlatform?.()).toBe('ios')
    expect(win.CapacitorCustomPlatform).toEqual({ name: 'ios' })
  })
})

describe('the screenshot page is reproducible', () => {
  it('seeds Math.random, so the same shot is the same picture', () => {
    seedRandom(1)
    const first = [Math.random(), Math.random(), Math.random()]
    seedRandom(1)
    expect([Math.random(), Math.random(), Math.random()]).toEqual(first)
    expect(new Set(first).size).toBe(3)
  })

  // The store merges localStorage under the URL query, so a field the shot's
  // query does not mention would otherwise come from the last room anyone left.
  it('forgets the remembered room', () => {
    localStorage.setItem('handlebars.guitar-advanced.v1', '{"practice":"quiz"}')
    clearRoomState()
    expect(localStorage.length).toBe(0)
  })
})

describe('the pointer probe', () => {
  it('reports what matchMedia actually answered', () => {
    Object.assign(window, { matchMedia: () => ({ matches: true }) })
    reportPointerType()
    expect(document.documentElement.dataset.pointer).toBe('coarse')

    Object.assign(window, { matchMedia: () => ({ matches: false }) })
    reportPointerType()
    expect(document.documentElement.dataset.pointer).toBe('fine')
  })
})
