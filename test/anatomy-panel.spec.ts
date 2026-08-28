import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import AnatomyPanel from '../src/components/AnatomyPanel.vue'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

describe('AnatomyPanel', () => {
  it('explains a tertian chord with its stack of thirds', () => {
    useRoomStore()
    const w = mount(AnatomyPanel)
    expect(w.text()).toContain('stacking thirds')
    expect(w.find('[data-stack]').text()).toContain('E — G♯ — B')
    expect(w.find('[data-stack]').text()).toContain('major third + minor third')
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[1]!.text()).toContain('major third')
    expect(rows[1]!.text()).toContain('quality tone')
  })

  it('drops the stack for a non-tertian chord and names the suspension', async () => {
    const store = useRoomStore()
    store.chordId = 'sus4'
    const w = mount(AnatomyPanel)
    expect(w.find('[data-stack]').exists()).toBe(false)
    expect(w.text()).toContain('Not a plain stack')
    expect(w.find('[data-token="4"]').text()).toContain('suspension')
  })

  it('parenthesizes optional tones', () => {
    const store = useRoomStore()
    store.chordId = '13'
    const w = mount(AnatomyPanel)
    const third = w.find('[data-token="3"]')
    expect(third.text()).toContain('(3)')
    expect(third.text()).toContain('(G♯)')
  })

  it('describes the overlay chord under its numeral and function', async () => {
    const store = useRoomStore()
    store.mode = 'scale'
    const w = mount(AnatomyPanel)
    expect(w.find('[data-overlay-line]').exists()).toBe(false)
    expect(w.findAll('tbody tr')).toHaveLength(7) // the E major scale itself
    store.setOverlay('5-7') // B7, the V7 of E major
    await w.vm.$nextTick()
    const line = w.find('[data-overlay-line]')
    expect(line.text()).toContain('V7')
    expect(line.text()).toContain('B7')
    expect(line.text()).toContain('dominant')
    expect(w.findAll('tbody tr')).toHaveLength(4) // now the chord, not the scale
  })
})
