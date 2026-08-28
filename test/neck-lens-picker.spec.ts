import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import NeckLensPicker from '../src/components/NeckLensPicker.vue'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

describe('NeckLensPicker', () => {
  it('renders All plus a button per string labeled by the tuning letters', () => {
    const w = mount(NeckLensPicker)
    const btns = w.findAll('[data-solo-string]')
    expect(btns).toHaveLength(7) // All + six strings
    expect(btns.at(0)!.text()).toBe('All')
    expect(btns.at(1)!.text()).toBe('E')
    expect(btns.at(2)!.text()).toBe('A')
    expect(btns.at(6)!.text()).toBe('E')
  })

  it('toggles strings in and out of the lens, several at once', async () => {
    const store = useRoomStore()
    const w = mount(NeckLensPicker)
    expect(w.find('[data-solo-string="0"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-solo-string="6"]').trigger('click')
    await w.find('[data-solo-string="5"]').trigger('click')
    expect(store.soloStrings).toEqual([5, 6])
    expect(w.find('[data-solo-string="5"]').classes()).toContain('lens-btn-active')
    expect(w.find('[data-solo-string="6"]').classes()).toContain('lens-btn-active')
    expect(w.find('[data-solo-string="0"]').attributes('aria-pressed')).toBe('false')
    // a second click unselects just that string
    await w.find('[data-solo-string="6"]').trigger('click')
    expect(store.soloStrings).toEqual([5])
    expect(w.find('[data-solo-string="6"]').classes()).not.toContain('lens-btn-active')
    // All clears the lot
    await w.find('[data-solo-string="0"]').trigger('click')
    expect(store.soloStrings).toEqual([])
    expect(w.find('[data-solo-string="0"]').attributes('aria-pressed')).toBe('true')
  })

  it('toggles the octave map', async () => {
    const store = useRoomStore()
    const w = mount(NeckLensPicker)
    await w.find('[data-octaves]').trigger('click')
    expect(store.octaves).toBe('on')
    expect(w.find('[data-octaves]').classes()).toContain('lens-btn-active')
    await w.find('[data-octaves]').trigger('click')
    expect(store.octaves).toBe('off')
  })

  it('toggles the guide-tone lens, disabled when there is nothing to guide', async () => {
    const store = useRoomStore()
    const w = mount(NeckLensPicker)
    await w.find('[data-guides]').trigger('click')
    expect(store.guides).toBe('on')
    expect(w.find('[data-guides]').classes()).toContain('lens-btn-active')
    await w.find('[data-guides]').trigger('click')
    expect(store.guides).toBe('off')
    store.chordId = '5' // power chord: no 3rd or 7th
    await w.vm.$nextTick()
    expect(w.find('[data-guides]').attributes('disabled')).toBeDefined()
  })

  it('relabels its buttons when the tuning changes', async () => {
    const store = useRoomStore()
    const w = mount(NeckLensPicker)
    store.setTuning('drop-d')
    await w.vm.$nextTick()
    expect(w.find('[data-solo-string="1"]').text()).toBe('D')
  })
})
