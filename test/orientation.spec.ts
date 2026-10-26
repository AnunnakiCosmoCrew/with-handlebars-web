import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
// Half of this feature is CSS the runner cannot execute — happy-dom does not
// evaluate scoped styles, has no notch and cannot be turned sideways — so
// those halves are read as source text, the way safe-areas.spec.ts does. The
// other half is a listener, and that one mounts.
import App from '../src/App.vue'
import appVue from '../src/App.vue?raw'
import comboSelectVue from '../src/components/ui/ComboSelect.vue?raw'
import displayOptionsVue from '../src/components/DisplayOptions.vue?raw'
import tuningPickerVue from '../src/components/TuningPicker.vue?raw'

const LANDSCAPE_QUERY = '@media (orientation: landscape) and (max-height: 480px)'

/** A flat rule, from its brace to the matching close. */
const ruleFor = (selector: string, source: string) =>
  source.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))?.[0] ?? ''

describe('landscape layout', () => {
  it('bleeds the board past the horizontal safe insets', () => {
    // The failure is invisible everywhere it is safe to be wrong: back on a
    // plain -1rem the website, the iPad and every portrait phone look
    // identical, and only a notched phone held sideways loses ~100pt of the
    // widest view in the app.
    const rule = ruleFor('.board-scroll', appVue)
    expect(rule).toContain('calc(-1rem - var(--hb-safe-left))')
    expect(rule).toContain('calc(-1rem - var(--hb-safe-right))')
    expect(rule).toContain('calc(1rem + var(--hb-safe-left))')
    expect(rule).toContain('calc(1rem + var(--hb-safe-right))')
  })

  it('bleeds the staff the same way', () => {
    const rule = ruleFor('.staff-scroll', appVue)
    expect(rule).toContain('calc(-1rem - var(--hb-safe-left))')
    expect(rule).toContain('calc(1rem + var(--hb-safe-right))')
  })

  it('keeps the bleed out of any media query', () => {
    // Tidying it into the landscape block would look harmless and would fork
    // the app's layout from the website's, which ADR-0003 exists to prevent.
    expect(appVue.indexOf('.board-scroll {')).toBeGreaterThan(-1)
    expect(appVue.indexOf('.board-scroll {')).toBeLessThan(appVue.indexOf('@media'))
  })

  it('gates the compact layout on height as well as orientation', () => {
    // `orientation: landscape` alone is true of nearly every desktop window:
    // drop the height clause and a 1440x900 browser silently gets the phone
    // layout, which nobody testing on a phone would ever see.
    expect(appVue).toContain(LANDSCAPE_QUERY)
  })

  it('spends header height on the board', () => {
    const block = appVue.slice(appVue.indexOf(LANDSCAPE_QUERY))
    expect(block).toContain('.brand-tag')
    expect(block).toContain('display: none')
  })

  const popovers = [
    { name: 'ComboSelect', selector: '.combo-list', source: comboSelectVue },
    { name: 'DisplayOptions', selector: '.display-panel', source: displayOptionsVue },
    { name: 'TuningPicker', selector: '.tuning-dialog', source: tuningPickerVue },
  ] as const

  it.each(popovers)('$name caps itself against the viewport', ({ selector, source }) => {
    // A panel taller than a landscape phone screen runs off the bottom with
    // nothing to drag — the control is simply unreachable.
    const rule = ruleFor(selector, source)
    expect(rule).toContain('overflow-y: auto')
    expect(rule).toContain('overscroll-behavior: contain')
    expect(rule).toContain('100dvh')
  })

  it.each(popovers)('$name keeps a vh fallback under the dvh cap', ({ selector, source }) => {
    // ADR-0003 floors iOS at 15.0; dvh arrived in Safari 15.4. The older
    // parser drops the line it cannot read and keeps the one before it.
    const rule = ruleFor(selector, source)
    expect(rule.indexOf('100vh')).toBeGreaterThan(-1)
    expect(rule.indexOf('100dvh')).toBeGreaterThan(rule.indexOf('100vh'))
  })
})

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

const mountApp = () => mount(App, { attachTo: document.body, global: { plugins: [createPinia()] } })

let wrapper: ReturnType<typeof mountApp> | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

/** happy-dom lays nothing out, so the scroller's metrics are all zero. */
const stubMetrics = (el: HTMLElement, scrollWidth: number, clientWidth: number) => {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

const rotate = async () => {
  window.dispatchEvent(new Event('resize'))
  await nextFrame()
}

describe('board scroll across a rotation', () => {
  // The arithmetic is board-scroll.spec.ts's job; what is left to prove here
  // is the wiring — that a resize reaches the scroller at all, and that it
  // stops doing so once the component is gone.
  it('restores the place on the neck when the viewport changes', async () => {
    wrapper = mountApp()
    const el = wrapper.get('.board-scroll').element as HTMLElement
    stubMetrics(el, 1000, 400)
    el.scrollLeft = 300 // halfway along a 600px range
    await wrapper.get('.board-scroll').trigger('scroll')

    stubMetrics(el, 1200, 800) // sideways: wider viewport, shorter range
    await rotate()

    expect(el.scrollLeft).toBe(200) // still halfway
  })

  it('ignores the scroll its own restore fires', async () => {
    // happy-dom does not echo a scrollLeft write back as a scroll event, so
    // the echo is dispatched by hand — and with the element clamped to 0, the
    // way a browser mid-relayout would report it. Unguarded, that is the read
    // that would replace a remembered quarter-of-the-neck with the nut.
    wrapper = mountApp()
    const el = wrapper.get('.board-scroll').element as HTMLElement
    stubMetrics(el, 1000, 400)
    el.scrollLeft = 150 // a quarter along a 600px range
    await wrapper.get('.board-scroll').trigger('scroll')

    stubMetrics(el, 1200, 800)
    await rotate()
    expect(el.scrollLeft).toBe(100) // still a quarter

    el.scrollLeft = 0
    await wrapper.get('.board-scroll').trigger('scroll')

    stubMetrics(el, 1000, 400)
    await rotate()
    expect(el.scrollLeft).toBe(150) // the quarter survived the echo
  })

  it('takes the listener down with the component', async () => {
    wrapper = mountApp()
    const el = wrapper.get('.board-scroll').element as HTMLElement
    stubMetrics(el, 1000, 400)
    el.scrollLeft = 300
    await wrapper.get('.board-scroll').trigger('scroll')

    wrapper.unmount()
    wrapper = null
    stubMetrics(el, 1200, 800)
    await rotate()

    expect(el.scrollLeft).toBe(300)
  })
})
