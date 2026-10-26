// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// A <button> does not inherit `color`; the browser draws its label in its own
// button text colour, which is black unless the page declares a dark scheme.
// Without these two lines the dark theme's buttons came out black on the dark
// surface (HB-176). happy-dom computes no browser defaults, so the guard is on
// the stylesheet itself.
const css = readFileSync(resolve('src/style.css'), 'utf8')
const [lightBlock, darkBlock] = css.split('@media (prefers-color-scheme: dark)')

describe('color-scheme', () => {
  it('declares the light scheme on :root', () => {
    expect(lightBlock).toMatch(/:root\s*\{[^}]*color-scheme:\s*light;/)
  })

  it('flips to the dark scheme with the dark tokens', () => {
    expect(darkBlock, 'the dark media block is missing').toBeDefined()
    expect(darkBlock).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark;/)
  })
})
