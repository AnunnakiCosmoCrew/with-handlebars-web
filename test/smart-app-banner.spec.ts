// @vitest-environment node
import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import notFoundHtml from '../404.html?raw'
import aboutHtml from '../about.html?raw'
import indexHtml from '../index.html?raw'
import privacyHtml from '../privacy.html?raw'
import appVue from '../src/App.vue?raw'
import config from '../vite.config'

/**
 * Safari's Smart App Banner (HB-145) is how an iPhone visitor finds out the site
 * is also an app: Apple's own banner at the top of the page, with the icon,
 * "View" for the listing and "Open" once the app is installed. It costs the page
 * nothing but a meta tag, and it is Safari-only, so it never paints inside the
 * WKWebView and needs no platform guard (ADR-0003 is about commerce the shell
 * carries, and this is the shell's own listing).
 *
 * What can go wrong is quiet: a page that forgets the tag just shows no banner,
 * and an id that drifts from the listing shows a banner for nothing. So every
 * page in the build inputs has to carry it, with the id the footer links to.
 */
const APP_ID = '6815550767'
const META = `<meta name="apple-itunes-app" content="app-id=${APP_ID}" />`

const pages = {
  '404.html': notFoundHtml,
  'about.html': aboutHtml,
  'index.html': indexHtml,
  'privacy.html': privacyHtml,
}

describe('the Smart App Banner meta', () => {
  it('covers every page that ships', () => {
    const input = config.build?.rollupOptions?.input as Record<string, string>
    expect(Object.values(input).map(p => basename(p)).sort()).toEqual(Object.keys(pages).sort())
  })

  for (const [page, html] of Object.entries(pages)) {
    it(`${page} carries it, once`, () => {
      expect(html.split(META)).toHaveLength(2)
      expect(html.match(/name="apple-itunes-app"/g)).toHaveLength(1)
    })
  }

  it('names the listing the footer links to', () => {
    // The badge's href is the listing; the banner's id has to be the same app.
    // index.html is a shell, so the room's badge is read from App.vue.
    for (const html of [appVue, aboutHtml]) {
      expect(html).toContain(`https://apps.apple.com/app/with-handlebars/id${APP_ID}`)
    }
  })
})
