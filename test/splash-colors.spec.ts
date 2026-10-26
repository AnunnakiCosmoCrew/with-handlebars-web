// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// --hb-bg is the launch screen's whole design: the storyboard paints it, and
// the web view's first paint is the same token, so the handover has no seam.
// That only holds while every copy of the colour agrees, and this ticket left
// four of them. src/style.css is the source; everything below is checked
// against it.
const css = readFileSync(resolve('src/style.css'), 'utf8')

const [lightBlock, darkBlock] = css.split('@media (prefers-color-scheme: dark)')
const bgOf = (block: string | undefined, where: string) => {
  const match = block?.match(/--hb-bg:\s*(#[0-9a-f]{6})/i)?.[1]
  expect(match, `--hb-bg not found in ${where}`).toBeDefined()
  return String(match).toLowerCase()
}

const cssBg = {
  light: bgOf(lightBlock, 'the :root block'),
  dark: bgOf(darkBlock, 'the dark media block'),
}

const colorset: {
  colors: {
    idiom: string
    appearances?: { appearance: string; value: string }[]
    color: { 'color-space': string; components: Record<string, string> }
  }[]
} = JSON.parse(
  readFileSync(resolve('assets/splash/SplashBackground.colorset/Contents.json'), 'utf8'),
)

// Xcode writes 8-bit components as "0xF7" when the colour was entered as bytes,
// which is what makes this a string comparison rather than a float-tolerance
// argument.
const hexOf = (c: Record<string, string>) =>
  ['red', 'green', 'blue']
    .map(k => String(c[k]).replace(/^0x/i, '').toLowerCase().padStart(2, '0'))
    .join('')

describe('the launch plate colour set', () => {
  it('is two universal colours, one of them dark', () => {
    expect(colorset.colors).toHaveLength(2)
    for (const c of colorset.colors) expect(c.idiom).toBe('universal')
    const darkOnes = colorset.colors.filter(c =>
      c.appearances?.some(a => a.appearance === 'luminosity' && a.value === 'dark'),
    )
    expect(darkOnes).toHaveLength(1)
  })

  // Not display-p3: the web view renders the tokens as sRGB, so a P3 plate
  // would be a measurably different grey — the seam this design exists to
  // avoid, arriving through the colour space instead of the artwork.
  it('is sRGB and fully opaque', () => {
    for (const { color } of colorset.colors) {
      expect(color['color-space']).toBe('srgb')
      expect(color.components.alpha).toBe('1.000')
    }
  })

  it('is --hb-bg, in both themes', () => {
    for (const c of colorset.colors) {
      const isDark = c.appearances?.some(a => a.value === 'dark')
      expect(`#${hexOf(c.color.components)}`).toBe(isDark ? cssBg.dark : cssBg.light)
    }
  })
})

describe('the storyboard', () => {
  const storyboard = readFileSync(
    resolve('ios/App/App/Base.lproj/LaunchScreen.storyboard'),
    'utf8',
  )

  // Only the light value lives here, and only as Xcode's design-time fallback
  // — UIKit resolves the appearance from Assets.car at runtime. It is still a
  // copy of the colour, and it is the one nobody remembers exists.
  it('carries the light plate as its design-time fallback', () => {
    const named = storyboard.match(
      /<namedColor name="SplashBackground">\s*<color red="([\d.]+)" green="([\d.]+)" blue="([\d.]+)"/,
    )
    expect(named, 'no SplashBackground namedColor in the storyboard').not.toBeNull()
    const hex = [...(named ?? [])]
      .slice(1, 4)
      .map(v => Math.round(Number(v) * 255).toString(16).padStart(2, '0'))
      .join('')
    expect(`#${hex}`).toBe(cssBg.light)
  })
})

// The renderers that flatten an alpha channel away spell the two backgrounds
// out, because flattening needs a concrete colour to flatten onto. Their
// comments say to keep them in step by hand; this is the hand.
describe('the renderers that flatten', () => {
  it.each(['tools/render-icon.sh', 'tools/render-shots.sh'])('%s flattens onto --hb-bg', file => {
    const script = readFileSync(resolve(file), 'utf8')
    expect(script).toContain(`LIGHT_BG='${cssBg.light}'`)
    expect(script).toContain(`DARK_BG='${cssBg.dark}'`)
  })
})

// The manifest carries one background_color and one theme_color, with no
// prefers-color-scheme to switch on, so both are the light plate — two more
// copies of the literal, in a file nothing else in the suite reads for colour.
describe('the web app manifest', () => {
  const manifest: { background_color: string; theme_color: string } = JSON.parse(
    readFileSync(resolve('public/site.webmanifest'), 'utf8'),
  )

  it('is --hb-bg, light in both roles', () => {
    expect(manifest.background_color.toLowerCase()).toBe(cssBg.light)
    expect(manifest.theme_color.toLowerCase()).toBe(cssBg.light)
  })
})

// The browser chrome around the page. Both plates live here, twice over, and
// the manifest's theme_color has to agree with the light one or an installed
// app and a browser tab tint differently.
describe('the theme-color metas', () => {
  it.each(['index.html', 'about.html'])('%s carries both plates', page => {
    const html = readFileSync(resolve(page), 'utf8')
    const meta = (scheme: string) =>
      html
        .match(
          new RegExp(
            `<meta name="theme-color" media="\\(prefers-color-scheme: ${scheme}\\)" content="(#[0-9a-f]{6})"`,
            'i',
          ),
        )?.[1]
        ?.toLowerCase()
    expect(meta('light'), `${page} light`).toBe(cssBg.light)
    expect(meta('dark'), `${page} dark`).toBe(cssBg.dark)
  })
})

describe('the synced catalogue', () => {
  // `assets/` is the source of truth; what sits under Assets.xcassets is a copy
  // the render scripts make. A commit where the two have drifted is a commit
  // where the sync was never run — which is how ios/ came to be still shipping
  // Capacitor's stock app icon four commits after HB-52 landed the real one.
  const sets: [string, string][] = [
    ['assets/splash/SplashBackground.colorset', 'SplashBackground.colorset'],
    ['assets/splash/SplashMark.imageset', 'SplashMark.imageset'],
    ['assets/appicon', 'AppIcon.appiconset'],
  ]

  it.each(sets)('%s is byte-for-byte what ios/ ships', (source, set) => {
    const shipped = resolve('ios/App/App/Assets.xcassets', set)
    const files = readdirSync(resolve(source)).sort()

    // Both directions: a file the sync forgot to copy and one it forgot to
    // remove are the same bug wearing different hats.
    expect(readdirSync(shipped).sort()).toEqual(files)
    for (const file of files) {
      expect(
        readFileSync(resolve(shipped, file)).equals(readFileSync(resolve(source, file))),
        file,
      ).toBe(true)
    }
  })
})
