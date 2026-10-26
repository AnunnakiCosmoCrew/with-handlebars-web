import { afterEach, describe, expect, it, vi } from 'vitest'
// about.html is hand-written static HTML, not a component — so this spec reads
// the shipped file and runs the guard it carries, rather than mounting anything.
import html from '../about.html?raw'

// Every script tag, whatever it carries: matching only attribute-less
// <script> would let a bundled or nonce-tagged one slip past the count below.
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => ({
  attributes: (m[1] ?? '').trim(),
  body: m[2] ?? '',
}))

const runGuard = () => new Function(scripts[0]?.body ?? '')()

afterEach(() => {
  // The guard's click listener stays on the document — it reads the bridge
  // fresh on every click, so with the stub gone it is inert.
  Reflect.deleteProperty(window, 'Capacitor')
  document.documentElement.removeAttribute('data-platform')
  document.body.innerHTML = ''
})

/** Stand in for the shell, with the one bridge method the sheet rides on. */
const stubShell = (nativePromise = vi.fn(() => Promise.resolve())) => {
  Object.assign(window, {
    Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true, nativePromise },
  })
  return nativePromise
}

/** Click a link on the page, and report whether the navigation was called off. */
const clickLink = (href: string) => {
  const a = document.createElement('a')
  a.setAttribute('href', href)
  a.textContent = 'go'
  document.body.append(a)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  a.dispatchEvent(event)
  return event
}

describe('the about page', () => {
  it('ships one inline guard and no bundle (ADR-0001 as amended by HB-40)', () => {
    expect(scripts).toHaveLength(1)
    // No attributes at all is the guard rail: it rules out src=, type=module
    // and anything else that would make this page a build input, without
    // depending on which quotes the attribute happened to be written with.
    expect(scripts[0]?.attributes).toBe('')
  })

  it('records the native platform on <html> when the shell bridge is there', () => {
    Object.assign(window, { Capacitor: { getPlatform: () => 'ios' } })
    runGuard()
    expect(document.documentElement.dataset.platform).toBe('native')
  })

  it('leaves the attribute off in a plain browser', () => {
    runGuard()
    expect(document.documentElement.hasAttribute('data-platform')).toBe(false)
  })

  it('ties that attribute to the Ko-fi pill', () => {
    // The attribute hides nothing on its own: the rule and the hook both have
    // to be present, or the pill renders inside the app (ADR-0003).
    expect(html).toContain("[data-platform='native'] .site-footer-support")
    expect(html).toContain('<p class="site-footer-support">')
  })

  it('links the App Store listing, as the official badge, inside the hidden-in-app block', () => {
    expect(html).toMatch(
      /<p class="site-footer-support site-footer-store">\s*<a class="app-store-link" href="https:\/\/apps\.apple\.com\/app\/with-handlebars\/id6815550767"[^>]*>\s*<img src="\/download-on-the-app-store\.svg"/,
    )
    expect(html).toContain('One app for iPhone, iPad and Apple silicon Macs.')
  })

  it('still offers the pill to the website', () => {
    expect(html).toContain('ko-fi.com/cosmocrew')
  })

  it('sends its outside links to a Safari sheet inside the app (HB-48)', () => {
    const nativePromise = stubShell()
    runGuard()
    const event = clickLink('https://cosmocrew.dev/')
    expect(nativePromise).toHaveBeenCalledWith('Browser', 'open', {
      url: 'https://cosmocrew.dev/',
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves the mailbox and its own pages to navigate as they always did', () => {
    const nativePromise = stubShell()
    runGuard()
    // A Safari sheet cannot open mailto:, and the room is the app's own page.
    expect(clickLink('mailto:contact@cosmocrew.dev').defaultPrevented).toBe(false)
    expect(clickLink('/').defaultPrevented).toBe(false)
    expect(nativePromise).not.toHaveBeenCalled()
  })

  it('never intercepts a click on the website', () => {
    runGuard()
    expect(clickLink('https://cosmocrew.dev/').defaultPrevented).toBe(false)
  })

  it('climbs out of the text node a click is reported against', () => {
    // event.target inside an anchor can be the Text node, which has no
    // closest(). happy-dom does not deliver a text-node dispatch to a document
    // listener reliably enough to drive that end to end here, so this pins the
    // climb itself; test/external-link.spec.ts exercises the same walk against
    // the handler it is copied from.
    expect(html).toContain("while (node && typeof node.closest !== 'function') node = node.parentNode")
  })

  it('names every outside link it has to cover', () => {
    // If a new external link lands on this page, it is already covered by the
    // delegated listener — this is the inventory, not the mechanism.
    for (const url of [
      'https://github.com/AnunnakiCosmoCrew/with-handlebars',
      'https://cosmocrew.dev/',
      'https://github.com/gleitz/midi-js-soundfonts',
      'https://luvita.tr/',
    ]) {
      expect(html).toContain(`href="${url}`)
    }
  })

  it('names the company behind the brand (ADR 0001)', () => {
    // The same line the room's footer carries, word for word — five sites are
    // converging on one string, so it is compared whole. The entity has to be
    // the link: a reviewer's next click is the whole point.
    expect(html).toContain('© 2026 CosmoCrew — a brand of')
    expect(html).toContain('<a href="https://luvita.tr/" rel="noopener">Luvita Teknoloji Ltd. Şti.</a>')
  })
})
