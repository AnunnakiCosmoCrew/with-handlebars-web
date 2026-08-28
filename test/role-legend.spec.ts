import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import RoleLegend from '../src/components/RoleLegend.vue'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

describe('RoleLegend', () => {
  it('renders nothing while roles are off', () => {
    useRoomStore()
    const w = mount(RoleLegend)
    expect(w.find('.role-legend').exists()).toBe(false)
  })

  it('lists only the roles present in the selection', async () => {
    const store = useRoomStore()
    store.roles = 'on'
    const w = mount(RoleLegend)
    // E major triad: root, third, fifth — no seventh, no extensions
    expect(w.findAll('.role-entry').map(e => e.attributes('data-role'))).toEqual([
      'root',
      'third',
      'fifth',
    ])
    expect(w.text()).toContain('Root')
    expect(w.text()).not.toContain('7th')
    store.chordId = '13'
    await w.vm.$nextTick()
    expect(w.findAll('.role-entry').map(e => e.attributes('data-role'))).toEqual([
      'root',
      'third',
      'fifth',
      'seventh',
      'extension',
    ])
  })

  it('notes when the roles follow the overlay chord', async () => {
    const store = useRoomStore()
    store.roles = 'on'
    store.mode = 'scale'
    const w = mount(RoleLegend)
    expect(w.find('.role-note').exists()).toBe(false)
    store.setOverlay('5-7')
    await w.vm.$nextTick()
    expect(w.find('.role-note').text()).toContain('overlay chord')
  })
})
