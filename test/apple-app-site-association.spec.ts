// @vitest-environment node
import { describe, expect, it } from 'vitest'
import capacitorConfig from '../capacitor.config'
import { BOARD_TUNING_SLUGS } from '../src/lib/board-path'
import aasaRaw from '../public/.well-known/apple-app-site-association?raw'
import headersRaw from '../public/_headers?raw'
import entitlementsRaw from '../ios/App/App/App.entitlements?raw'
import pbxprojRaw from '../ios/App/App.xcodeproj/project.pbxproj?raw'

// The association file is App Review evidence (HB-114): it binds the domain to
// the Apple developer account that submits the app, which is what answered the
// 4.1(b) copycat rejection. The identifier inside it is Team ID + bundle ID —
// change either half and the proof silently stops naming this app, so both are
// pinned here the way icon-assets.spec.ts pins the other public metadata.
const TEAM_ID = 'B3P6L3T55C'

describe('the apple-app-site-association the domain serves', () => {
  const aasa = JSON.parse(aasaRaw)

  it('names this app under the submitting Team ID', () => {
    expect(aasa.applinks.details).toHaveLength(1)
    expect(aasa.applinks.details[0].appIDs).toEqual([`${TEAM_ID}.${capacitorConfig.appId}`])
  })

  it('claims the room and the board pages, and nothing else (HB-59, HB-153)', () => {
    // A shared board is `/` with its state in the query, or a tier-1 board's own
    // page (share.ts), and that is the whole claim: About, privacy, the hubs and
    // every other page keep opening in the browser. Four slashes after the tuning
    // is a board path and never a hub. Leaving out `?` means any query matches.
    const components = aasa.applinks.details[0].components.map(
      ({ comment: _comment, ...rest }: Record<string, unknown>) => rest,
    )
    expect(components).toEqual([
      { '/': '/' },
      ...BOARD_TUNING_SLUGS.map(slug => ({ '/': `/${slug}/*/*/*/` })),
    ])
  })

  it('is served as application/json', () => {
    // Cloudflare Pages gives extensionless files application/octet-stream,
    // which Apple's CDN rejects — _headers is what corrects the route.
    expect(headersRaw).toMatch(
      /^\/\.well-known\/apple-app-site-association\n {2}Content-Type: application\/json$/m,
    )
  })
})

describe('the app side of the association', () => {
  // A claim on the site does nothing without the entitlement in the signed app,
  // and an entitlements file the target does not point at is never signed in.
  it('asks for withhandlebars.com links', () => {
    expect(entitlementsRaw).toContain('<key>com.apple.developer.associated-domains</key>')
    expect(entitlementsRaw).toContain('<string>applinks:withhandlebars.com</string>')
  })

  it('is wired into both build configurations of the app target', () => {
    expect(pbxprojRaw.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2)
  })
})
