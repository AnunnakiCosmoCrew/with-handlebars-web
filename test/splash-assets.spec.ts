// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const set = (file: string) => resolve('assets/splash/SplashMark.imageset', file)

const catalogue: {
  images: {
    filename: string
    idiom: string
    scale: string
    appearances?: { appearance: string; value: string }[]
  }[]
} = JSON.parse(readFileSync(set('Contents.json'), 'utf8'))

// The tile is 128pt, so its three scales are 128/256/384px. LaunchScreen's
// constraints say 128 too; test/launch-screen.spec.ts is what ties them.
const POINTS = 128

// A PNG's colour type is byte 25, and its dimensions are the big-endian uint32s
// at 16 and 20. Reading them straight out of the file keeps ImageMagick out of
// CI, the same trick test/icon-assets.spec.ts plays.
const png = (file: string) => {
  const bytes = readFileSync(set(file))
  return {
    colourType: bytes[25],
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

const appearanceOf = (image: { appearances?: { appearance: string; value: string }[] }) =>
  image.appearances
    ? image.appearances.map(a => `${a.appearance}:${a.value}`).join()
    : 'default'

describe('the launch mark catalogue', () => {
  it('is every scale in both themes', () => {
    expect(catalogue.images).toHaveLength(6)
    expect(
      catalogue.images.map(i => `${appearanceOf(i)} ${i.scale}`).sort(),
    ).toEqual([
      'default 1x',
      'default 2x',
      'default 3x',
      'luminosity:dark 1x',
      'luminosity:dark 2x',
      'luminosity:dark 3x',
    ])
    for (const image of catalogue.images) expect(image.idiom).toBe('universal')
  })

  // tinted is an app-icon appearance. An imageset carrying one doesn't fail to
  // build — it is simply ignored, which is worse.
  it('claims no tinted variant', () => {
    for (const image of catalogue.images) {
      expect(appearanceOf(image)).not.toContain('tinted')
    }
  })

  it('references tiles that are actually there', () => {
    for (const { filename } of catalogue.images) {
      expect(existsSync(set(filename)), filename).toBe(true)
      expect(statSync(set(filename)).size, filename).toBeGreaterThan(0)
    }
  })

  // The deliberate inverse of the app icon's check: there an alpha channel is
  // a submission blocker, here it is the point. An opaque tile would sit on
  // the colour-set plate as a visible square. 6 is RGBA; PNG32: in the render
  // script is what makes it a constant rather than a coin flip.
  it('keeps its alpha channel', () => {
    for (const { filename } of catalogue.images) {
      expect(png(filename).colourType, filename).toBe(6)
    }
  })

  it('is the size each scale claims', () => {
    for (const { filename, scale } of catalogue.images) {
      const expected = POINTS * Number(scale.replace('x', ''))
      expect(png(filename), filename).toMatchObject({
        width: expected,
        height: expected,
      })
    }
  })
})
