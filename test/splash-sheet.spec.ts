import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandMark from '../src/BrandMark.vue'
import SplashSheet from '../src/splash/SplashSheet.vue'

describe('SplashSheet', () => {
  it('is the brand mark on a bare tile, and nothing else', () => {
    const w = mount(SplashSheet)
    expect(w.classes()).toContain('tile')
    expect(w.findAllComponents(BrandMark)).toHaveLength(1)
    expect(w.get('.mark').element.tagName.toLowerCase()).toBe('svg')
  })

  // Scoped styles are invisible to a mounted component, so the property the
  // whole render pipeline rests on has to be read out of the source. A tile
  // that paints its own plate is a second copy of --hb-bg, and it shows up on
  // the launch screen as a square of very slightly the wrong grey.
  it('paints no plate of its own', () => {
    const source = readFileSync(resolve('src/splash/SplashSheet.vue'), 'utf8')
    expect(source).toMatch(/background:\s*transparent/)
    expect(source).not.toContain('var(--hb-bg)')
    expect(source).not.toContain('radial-gradient')
  })

  // And the page has to undo what src/style.css puts on the body, or Chrome's
  // transparency flag is a silent no-op. The render script checks this too,
  // but only when somebody re-renders.
  it('is rendered on a page that clears the body background', () => {
    expect(readFileSync(resolve('splash.html'), 'utf8')).toMatch(
      /background:\s*transparent/,
    )
  })
})
