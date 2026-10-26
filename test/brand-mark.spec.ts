import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandMark from '../src/BrandMark.vue'

describe('BrandMark', () => {
  it('draws the nut, the string and the two dots', () => {
    const w = mount(BrandMark)
    expect(w.element.tagName.toLowerCase()).toBe('svg')
    expect(w.attributes('viewBox')).toBe('0 0 64 64')
    expect(w.findAll('line')).toHaveLength(2)
    expect(w.findAll('circle')).toHaveLength(2)
  })

  // The mark carries no size of its own: consumers style it through their own
  // class, which is why the root node must stay bare.
  it('leaves sizing and naming to the consumer', () => {
    const w = mount(BrandMark, { attrs: { class: 'brand-mark' } })
    expect(w.classes()).toEqual(['brand-mark'])
    expect(w.attributes('width')).toBeUndefined()
    expect(w.attributes('height')).toBeUndefined()
  })

  // The mark is decorative everywhere it appears — the wordmark beside it is
  // the accessible name.
  it('is hidden from assistive technology', () => {
    expect(mount(BrandMark).attributes('aria-hidden')).toBe('true')
  })

  // The guard against someone re-hardcoding a palette into the mark: every
  // colour comes from a design token, so both themes and the app icon follow
  // the tokens rather than a copy of them.
  it('takes every colour from a design token', () => {
    const html = mount(BrandMark).html()
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i)
    for (const token of ['--hb-board-line', '--hb-accent', '--hb-dot-tone']) {
      expect(html).toContain(`var(${token})`)
    }
  })
})
