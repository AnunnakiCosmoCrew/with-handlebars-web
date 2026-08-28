import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import PositionPicker from '../src/components/PositionPicker.vue'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

const mountPicker = () => mount(PositionPicker)

describe('PositionPicker', () => {
  it('renders All plus one button per box of the selection', () => {
    const w = mountPicker()
    // default E major chord: 3 arpeggio boxes
    expect(w.findAll('.position-btn').map(b => b.attributes('data-box'))).toEqual([
      '0',
      '1',
      '2',
      '3',
    ])
    expect(w.find('[data-box="0"]').text()).toBe('All')
  })

  it('grows with the selection and captions each box with its frets', async () => {
    const store = useRoomStore()
    const w = mountPicker()
    store.mode = 'scale'
    await w.vm.$nextTick()
    expect(w.findAll('.position-btn')).toHaveLength(8) // All + 7
    expect(w.find('[data-box="3"]').attributes('title')).toBe('Position 3 · frets 4–8')
  })

  it('sets the store box on click and marks the active button', async () => {
    const store = useRoomStore()
    const w = mountPicker()
    expect(w.find('[data-box="0"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-box="2"]').trigger('click')
    expect(store.box).toBe(2)
    expect(w.find('[data-box="2"]').classes()).toContain('position-btn-active')
    expect(w.find('[data-box="0"]').attributes('aria-pressed')).toBe('false')
  })

  it('offers the Box/Pattern toggle only while a position is active', async () => {
    const store = useRoomStore()
    const w = mountPicker()
    expect(w.find('.shape-toggle').exists()).toBe(false)
    await w.find('[data-box="1"]').trigger('click')
    expect(w.find('.shape-toggle').exists()).toBe(true)
    expect(w.find('[data-shape="box"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-shape="pattern"]').trigger('click')
    expect(store.shape).toBe('pattern')
    expect(w.find('[data-shape="pattern"]').classes()).toContain('position-btn-active')
  })

  it('offers the full lens family, sweep only in chord mode', async () => {
    const store = useRoomStore()
    const w = mountPicker()
    await w.find('[data-box="1"]').trigger('click')
    expect(w.findAll('.shape-btn').map(b => b.attributes('data-shape'))).toEqual([
      'box',
      'pattern',
      'diagonal',
      'run',
      'sweep',
    ])
    store.mode = 'scale'
    await w.vm.$nextTick()
    expect(w.findAll('.shape-btn').map(b => b.attributes('data-shape'))).toEqual([
      'box',
      'pattern',
      'diagonal',
      'run',
    ])
  })
})
