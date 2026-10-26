import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import App from '../src/App.vue'
import { useRoomStore } from '../src/stores/room.js'

vi.mock('@capacitor/browser', () => ({ Browser: { open: () => Promise.resolve() } }))

// happy-dom lays nothing out, so the scroller has no range of its own. Give
// the whole document a board-sized one: only `.board-scroll` is ever written
// to, and a range is all the alignment arithmetic reads.
const SCROLL_WIDTH = 1200
const CLIENT_WIDTH = 400
const RANGE = SCROLL_WIDTH - CLIENT_WIDTH
const stubbed = ['scrollWidth', 'clientWidth'] as const
const original = stubbed.map(k => Object.getOwnPropertyDescriptor(HTMLElement.prototype, k))

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => SCROLL_WIDTH,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => CLIENT_WIDTH,
  })
})

afterEach(() => {
  stubbed.forEach((k, i) => {
    if (original[i]) Object.defineProperty(HTMLElement.prototype, k, original[i]!)
    else Reflect.deleteProperty(HTMLElement.prototype, k)
  })
})

const mountApp = () => mount(App, { global: { plugins: [createPinia()] } })

describe('the board opens at the nut', () => {
  it('leaves a left-handed board at its right end', () => {
    // Handedness is a mirror inside the SVG, not in the scroller: for a
    // left-handed player the nut is the far end of the scroll range.
    history.replaceState(null, '', '/?hand=left')
    const w = mountApp()
    expect(useRoomStore().handedness).toBe('left')
    expect(w.get('.board-scroll').element.scrollLeft).toBe(RANGE)
  })

  it('leaves a right-handed board at the left end', () => {
    const w = mountApp()
    expect(w.get('.board-scroll').element.scrollLeft).toBe(0)
  })

  it('follows a change of hands mid-session', async () => {
    const w = mountApp()
    const store = useRoomStore()
    store.handedness = 'left'
    await nextTick()
    await nextTick() // the board re-renders mirrored first, then we align
    expect(w.get('.board-scroll').element.scrollLeft).toBe(RANGE)
    store.handedness = 'right'
    await nextTick()
    await nextTick()
    expect(w.get('.board-scroll').element.scrollLeft).toBe(0)
  })
})
