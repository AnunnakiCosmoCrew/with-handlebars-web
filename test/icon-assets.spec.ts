// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const set = (file: string) => resolve('assets/appicon', file)
// The manifest's icons ship out of public/ rather than the catalogue.
const pub = (file: string) => resolve('public', file)

const catalogue: {
  images: { filename: string; size: string; idiom: string; platform: string;
    appearances?: { appearance: string; value: string }[] }[]
} = JSON.parse(readFileSync(set('Contents.json'), 'utf8'))

// A PNG's colour type is byte 25 of the file: 6 is RGBA and 4 is grey+alpha.
// The App Store rejects an icon with an alpha channel, so this catches a
// half-finished `npm run icon` without needing ImageMagick in CI.
const colourType = (path: string) => readFileSync(path)[25]

// The IHDR is fixed-width and first, so the real dimensions are byte offsets
// too: width is 16-19 big-endian, height 20-23. A declared `sizes` is only a
// promise until something reads the file back.
const pngSize = (path: string) => {
  const png = readFileSync(path)
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
}

const manifest: {
  name: string
  short_name: string
  description: string
  start_url: string
  scope: string
  display: string
  icons: { src: string; sizes: string; type: string; purpose: string }[]
} = JSON.parse(readFileSync(pub('site.webmanifest'), 'utf8'))

describe('the app icon catalogue', () => {
  // Xcode 16's single-size form: one 1024 square per appearance, no scales.
  it('is one 1024 square per appearance', () => {
    expect(catalogue.images).toHaveLength(3)
    for (const image of catalogue.images) {
      expect(image.size).toBe('1024x1024')
      expect(image.idiom).toBe('universal')
      expect(image.platform).toBe('ios')
      expect(image).not.toHaveProperty('scale')
    }
  })

  it('covers the default, dark and tinted appearances', () => {
    const appearances = catalogue.images.map(i =>
      i.appearances ? i.appearances.map(a => `${a.appearance}:${a.value}`).join() : 'default',
    )
    expect(appearances.sort()).toEqual([
      'default',
      'luminosity:dark',
      'luminosity:tinted',
    ])
  })

  it('references icons that are actually there', () => {
    for (const { filename } of catalogue.images) {
      expect(existsSync(set(filename)), filename).toBe(true)
      expect(statSync(set(filename)).size, filename).toBeGreaterThan(0)
    }
  })

  it('ships no alpha channel', () => {
    for (const { filename } of catalogue.images) {
      expect([0, 2, 3], filename).toContain(colourType(set(filename)))
    }
  })
})

describe('the web app manifest', () => {
  it('describes a standalone app rooted at the site', () => {
    expect(manifest.name).toBe('With Handlebars')
    // Home Screen labels get truncated past roughly a dozen characters, which
    // is the whole reason short_name exists.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    expect(manifest.description).toBeTruthy()
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
  })

  // 192 and 512 are what Chrome's install criteria ask for; the maskable one is
  // the same plate with a smaller mark, for the circle Android crops to.
  it('is the 192/512 pair plus a maskable 512', () => {
    const purposes = (purpose: string) =>
      manifest.icons.filter(i => i.purpose === purpose).map(i => i.sizes).sort()
    expect(purposes('any')).toEqual(['192x192', '512x512'])
    expect(purposes('maskable')).toEqual(['512x512'])
  })

  it('references icons that are actually there, at the size it claims', () => {
    for (const { src, sizes, type } of manifest.icons) {
      // Root-relative: the manifest is served from the site root, and public/
      // is copied there verbatim, so the path is the filename.
      expect(src, src).toMatch(/^\/[\w-]+\.png$/)
      const file = pub(src.slice(1))
      expect(existsSync(file), src).toBe(true)
      expect(statSync(file).size, src).toBeGreaterThan(0)
      expect(type, src).toBe('image/png')
      expect(pngSize(file), src).toBe(sizes)
    }
  })

  // Not a store requirement here, only consistency: these come off the same
  // flatten() as the App Store squares, so an alpha channel means a run that
  // took a different path than the one the icons are documented to take.
  it('ships no alpha channel', () => {
    for (const { src } of manifest.icons) {
      expect([0, 2, 3], src).toContain(colourType(pub(src.slice(1))))
    }
  })

  // The maskable one is a second screenshot, taken with `icon.html?mark=512`.
  // Drop the query flag and every check above still passes on a duplicate of
  // the 512 — so this is the one that notices.
  it('draws the maskable icon smaller than the plain 512', () => {
    const srcOf = (match: (i: (typeof manifest.icons)[number]) => boolean) => {
      const icon = manifest.icons.find(match)
      expect(icon).toBeDefined()
      return pub(String(icon?.src).slice(1))
    }
    const any512 = srcOf(i => i.purpose === 'any' && i.sizes === '512x512')
    const maskable = srcOf(i => i.purpose === 'maskable')
    expect(readFileSync(maskable).equals(readFileSync(any512))).toBe(false)
  })

  it('is linked from both pages that ship', () => {
    for (const page of ['index.html', 'about.html']) {
      expect(readFileSync(resolve(page), 'utf8'), page).toContain(
        '<link rel="manifest" href="/site.webmanifest" />',
      )
    }
  })
})
