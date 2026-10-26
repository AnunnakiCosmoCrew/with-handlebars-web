import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../src/App.vue'
import { useRoomStore } from '../src/stores/room.js'

// The Safari sheet's plugin is native-only and imported lazily (ADR-0005).
const openSheet = vi.fn((_options: unknown) => Promise.resolve())
vi.mock('@capacitor/browser', () => ({ Browser: { open: (o: unknown) => openSheet(o) } }))

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  Reflect.deleteProperty(window, 'Capacitor')
})

const mountApp = (options: Record<string, unknown> = {}) =>
  mount(App, { global: { plugins: [createPinia()] }, ...options })

/** Stand in for the bridge the iOS shell injects before the page is parsed. */
const stubNativeShell = () => {
  Object.assign(window, {
    Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  })
}

describe('app shell', () => {
  it('renders brand, controls, board, playback, info, and footer', () => {
    const w = mountApp()
    expect(w.get('h1').text()).toBe('With Handlebars')
    expect(w.get('.brand-tag').text()).toContain('guitar')
    expect(w.find('.brand-mark').exists()).toBe(true)
    expect(w.find('[role=radiogroup]').exists()).toBe(true)
    expect(w.find('.fretboard').exists()).toBe(true)
    expect(w.find('.play-button').exists()).toBe(true)
    expect(w.find('[data-share]').exists()).toBe(true)
    expect(w.find('.info').exists()).toBe(true)
    expect(w.get('.site-footer').text()).toContain('midi-js-soundfonts')
  })

  it('points the footer at the static pages, the crew, and the mailbox', () => {
    const w = mountApp()
    const hrefs = w.get('.site-footer').findAll('a').map(a => a.attributes('href'))
    // Relative, not "/about": Pages rewrites the extensionless path but
    // Capacitor's local server (ADR-0003) serves the file as it is named.
    expect(hrefs).toContain('/about.html')
    expect(hrefs).toContain('/privacy.html')
    expect(hrefs).toContain('https://cosmocrew.dev/')
    expect(hrefs).toContain('mailto:contact@cosmocrew.dev')
  })

  it('names the company behind the brand, in the app as well as on the site', () => {
    // A reviewer who lands here and goes no further still learns who owns the
    // software — the failure this line was written for. Asserted on both
    // mounts because it is attribution, not commerce: ADR-0003 takes the Ko-fi
    // pill out of the shell and must never take this with it. The string is
    // fixed company-wide, so it is compared whole rather than by keyword.
    for (const w of [mountApp(), (stubNativeShell(), mountApp())]) {
      const footer = w.get('.site-footer')
      expect(footer.text()).toContain('© 2026 CosmoCrew — a brand of Luvita Teknoloji Ltd. Şti.')
      // The name without the link does not satisfy the ADR: the next click is
      // the whole point.
      const entity = footer.findAll('a').find(a => a.text() === 'Luvita Teknoloji Ltd. Şti.')
      expect(entity?.attributes('href')).toBe('https://luvita.tr/')
    }
  })

  it('offers the Ko-fi pill on the website', () => {
    const w = mountApp()
    expect(w.find('.site-footer-support').exists()).toBe(true)
    expect(w.get('.support-link').attributes('href')).toBe('https://ko-fi.com/cosmocrew')
  })

  it('links the App Store listing, as the official badge, on the website only', () => {
    const href = 'https://apps.apple.com/app/with-handlebars/id6815550767'
    const w = mountApp()
    const link = w.get('.site-footer a.app-store-link')
    expect(link.attributes('href')).toBe(href)
    // Apple's artwork, not a redrawn pill: the image is the whole link.
    expect(link.get('img').attributes('src')).toBe('/download-on-the-app-store.svg')
    expect(link.get('img').attributes('alt')).toBe('Download on the App Store')
    expect(w.get('.site-footer').text()).toContain('One app for iPhone, iPad and Apple silicon Macs.')
    stubNativeShell()
    const native = mountApp()
    expect(native.find('.app-store-link').exists()).toBe(false)
    expect(native.get('.site-footer').findAll('a').map(a => a.attributes('href'))).not.toContain(href)
  })

  it('puts the App Store badge top right on an iPhone browser, and nowhere else (HB-147)', () => {
    const href = 'https://apps.apple.com/app/with-handlebars/id6815550767'
    expect(mountApp().find('.store-row').exists()).toBe(false)
    const ua = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
    try {
      const w = mountApp()
      const link = w.get('.store-row a.store-badge-link')
      expect(link.attributes('href')).toBe(href)
      expect(link.get('img').attributes('src')).toBe('/download-on-the-app-store.svg')
      // Above the header, not inside it: the header line has no room for it.
      expect(w.get('.room').element.firstElementChild?.classList.contains('store-row')).toBe(true)
      // The app's WKWebView says iPhone too, and must not advertise itself.
      stubNativeShell()
      expect(mountApp().find('.store-row').exists()).toBe(false)
    } finally {
      ua.mockRestore()
    }
  })

  it('hides the Ko-fi pill inside the app shell (ADR-0003)', () => {
    stubNativeShell()
    const w = mountApp()
    expect(w.find('.site-footer-support').exists()).toBe(false)
    const footer = w.get('.site-footer')
    const hrefs = footer.findAll('a').map(a => a.attributes('href') ?? '')
    expect(hrefs.filter(href => href.includes('ko-fi'))).toEqual([])
    // A pill went missing, not a footer.
    expect(hrefs).toContain('/about.html')
    expect(hrefs).toContain('/privacy.html')
    expect(footer.text()).toContain('midi-js-soundfonts')
  })

  it('sends the footer\'s outside links to a Safari sheet inside the app (HB-48)', async () => {
    stubNativeShell()
    const w = mountApp({ attachTo: document.body })
    const crew = w
      .get('.site-footer')
      .findAll('a')
      .find(a => a.attributes('href') === 'https://cosmocrew.dev/')
    await crew?.trigger('click')
    await vi.waitFor(() => expect(openSheet).toHaveBeenCalledWith({ url: 'https://cosmocrew.dev/' }))
    w.unmount()
  })

  it('groups the header by what acts on the room, the controls by the board', () => {
    // HB-86: Share and Display came up out of the controls row and the tuning
    // went down into it, which is what lets a phone spend two rows here
    // instead of four. Rendered, not read as text, so a move back shows up.
    const header = mountApp().get('.room-header')
    expect(header.find('[data-share]').exists()).toBe(true)
    expect(header.find('.display-button').exists()).toBe(true)
    expect(header.find('.tuning-header').exists()).toBe(false)

    const controls = mountApp().get('.room-controls')
    expect(controls.find('.tuning-header').exists()).toBe(true)
    expect(controls.find('[data-share]').exists()).toBe(false)
  })

  it('wraps the board in a horizontal scroller for small screens', () => {
    const w = mountApp()
    expect(w.get('.board-scroll').find('.fretboard').exists()).toBe(true)
  })

  it('shows the position picker always, the overlay picker only in scale mode', async () => {
    const w = mountApp()
    expect(w.find('.position-picker').exists()).toBe(true)
    expect(w.find('.neck-lenses').exists()).toBe(true)
    expect(w.find('.overlay-picker').exists()).toBe(false)
    history.replaceState(null, '', '/?scale=major')
    const scaled = mountApp()
    expect(scaled.find('.overlay-picker').exists()).toBe(true)
  })

  it('collapses the notation, circle, practice, details, and anatomy cards', async () => {
    const w = mountApp()
    const heads = w.findAll('.ccard-head').map(h => h.text())
    expect(heads).toEqual(['Notation', 'Circle of fifths', 'Practice', 'Details', "How it's built"])
    expect(w.find('.anatomy').exists()).toBe(true)
    await w.find('[data-card="How it\'s built"]').trigger('click')
    expect(w.find('.anatomy').exists()).toBe(false)
    await w.find('[data-card="Details"]').trigger('click')
    expect(w.find('.info').exists()).toBe(false)
    await w.find('[data-card="Notation"]').trigger('click')
    expect(w.find('.staff-scroll').exists()).toBe(false)
    expect(w.find('.practice').exists()).toBe(true)
    await w.find('[data-card="Practice"]').trigger('click')
    expect(w.find('.practice').exists()).toBe(false)
  })

  it('closes practice outright when its card is folded, silencing playback', async () => {
    history.replaceState(null, '', '/?practice=patterns')
    const w = mountApp()
    const store = useRoomStore()
    expect(store.practice).toBe('patterns')
    await w.find('[data-card="Practice"]').trigger('click')
    expect(store.practiceCard).toBe('hide')
    expect(store.practice).toBe('off')
  })
})
