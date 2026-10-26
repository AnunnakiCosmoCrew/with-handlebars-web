import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../src/App.vue'
import BrandMark from '../src/BrandMark.vue'
import IconSheet from '../src/icon/IconSheet.vue'
import OgCard from '../src/og/OgCard.vue'
import SplashSheet from '../src/splash/SplashSheet.vue'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

describe('IconSheet', () => {
  it('is the brand mark on a plate, and nothing else', () => {
    const w = mount(IconSheet)
    expect(w.classes()).toContain('plate')
    expect(w.findAllComponents(BrandMark)).toHaveLength(1)
    expect(w.get('.mark').element.tagName.toLowerCase()).toBe('svg')
  })

  // The manifest's maskable icon is this plate with the mark pulled into
  // Android's safe circle. A prop, so the art can't fork into a second sheet.
  it('takes the mark size from a prop, defaulting to the App Store plate', () => {
    expect(mount(IconSheet).attributes('style')).toContain('--hb-icon-mark: 640px')
    expect(mount(IconSheet, { props: { markSize: 512 } }).attributes('style')).toContain(
      '--hb-icon-mark: 512px',
    )
  })
})

// Every place the mark appears renders the component rather than a copy of its
// SVG. about.html is the one exception and is out of Vue's reach; the two
// copies inside the app are not allowed to come back.
describe('the mark has one source', () => {
  it('is the component in the room header', () => {
    const w = mount(App, { global: { plugins: [createPinia()] } })
    expect(w.findComponent(BrandMark).exists()).toBe(true)
  })

  it('is the component on the social card', () => {
    expect(mount(OgCard).findComponent(BrandMark).exists()).toBe(true)
  })

  it('is the component on the launch tile', () => {
    expect(mount(SplashSheet).findComponent(BrandMark).exists()).toBe(true)
  })
})
