import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachExternalLinkHandler,
  handleExternalClick,
  openInSafariSheet,
  opensOutsideTheApp,
} from '../src/lib/external-link.js'

// The plugin is native-only and imported lazily (ADR-0005), so the spec stands
// in for the module the app would fetch inside the shell.
const open = vi.fn((_options: unknown) => Promise.resolve())
vi.mock('@capacitor/browser', () => ({ Browser: { open: (o: unknown) => open(o) } }))

/** Stand in for the bridge the iOS shell injects before the page is parsed. */
const stubShell = () => {
  Object.assign(window, {
    Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  })
}

/** A link in the document, so the delegated handler has something to find. */
const linkTo = (href: string) => {
  const a = document.createElement('a')
  a.setAttribute('href', href)
  a.textContent = 'go'
  document.body.append(a)
  return a
}

/** Click it for real, and report whether the navigation was called off. */
const click = (a: HTMLAnchorElement) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  a.dispatchEvent(event)
  return event
}

beforeEach(() => {
  document.body.innerHTML = ''
  open.mockClear()
  open.mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  Reflect.deleteProperty(window, 'Capacitor')
})

describe('which links leave the app', () => {
  const origin = 'https://localhost'

  it('claims absolute http(s) links to another origin', () => {
    expect(opensOutsideTheApp('https://cosmocrew.dev/', origin)).toBe(true)
    expect(opensOutsideTheApp('http://example.com/x', origin)).toBe(true)
  })

  it('leaves the mailbox to the Mail app', () => {
    // A Safari sheet cannot open mailto: — Capacitor's own handling gets it
    // to Mail, which is what we want anyway.
    expect(opensOutsideTheApp('mailto:contact@cosmocrew.dev', origin)).toBe(false)
  })

  it("leaves the app's own pages alone", () => {
    expect(opensOutsideTheApp('about.html', origin)).toBe(false)
    expect(opensOutsideTheApp('/', origin)).toBe(false)
    expect(opensOutsideTheApp('https://localhost/about.html', origin)).toBe(false)
    expect(opensOutsideTheApp('#anchor', origin)).toBe(false)
  })

  it('shrugs at a missing or unparseable href', () => {
    expect(opensOutsideTheApp(null, origin)).toBe(false)
    expect(opensOutsideTheApp('http://[', origin)).toBe(false)
  })
})

describe('the delegated handler', () => {
  it('hands an external link to the Browser plugin instead of navigating', async () => {
    stubShell()
    const detach = attachExternalLinkHandler()
    const event = click(linkTo('https://cosmocrew.dev/'))
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith({ url: 'https://cosmocrew.dev/' }))
    detach()
  })

  it('finds the link when the click lands on its text', async () => {
    // A click is reported against the Text node inside the anchor, which has
    // no closest() — the handler has to climb to an element first.
    stubShell()
    const a = linkTo('https://cosmocrew.dev/')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: a.firstChild, configurable: true })
    handleExternalClick(event)
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith({ url: 'https://cosmocrew.dev/' }))
  })

  it('does not touch the mailbox or the app\'s own pages', () => {
    stubShell()
    const detach = attachExternalLinkHandler()
    expect(click(linkTo('mailto:contact@cosmocrew.dev')).defaultPrevented).toBe(false)
    expect(click(linkTo('about.html')).defaultPrevented).toBe(false)
    expect(open).not.toHaveBeenCalled()
    detach()
  })

  it('never listens on the website', () => {
    const detach = attachExternalLinkHandler()
    expect(click(linkTo('https://cosmocrew.dev/')).defaultPrevented).toBe(false)
    expect(open).not.toHaveBeenCalled()
    detach()
  })

  it('hands the link back to the shell when the sheet will not open', async () => {
    // The navigation is already called off by then, so we navigate ourselves
    // and let Capacitor app-switch. Degraded, never a dead link.
    open.mockImplementation(() => Promise.reject(new Error('unimplemented')))
    const href = vi.fn()
    const real = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: real.origin,
        set href(url: string) {
          href(url)
        },
      },
    })
    try {
      openInSafariSheet('https://cosmocrew.dev/')
      await vi.waitFor(() => expect(href).toHaveBeenCalledWith('https://cosmocrew.dev/'))
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real })
    }
  })

  it('ignores modified clicks and stops once detached', () => {
    stubShell()
    const a = linkTo('https://cosmocrew.dev/')
    handleExternalClick(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }),
    )
    const detach = attachExternalLinkHandler()
    detach()
    expect(click(a).defaultPrevented).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
