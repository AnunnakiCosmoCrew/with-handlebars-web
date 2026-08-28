import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import OverlayPicker from '../src/components/OverlayPicker.vue'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

function scaleStore(root = 'C') {
  const store = useRoomStore()
  store.mode = 'scale'
  store.root = root
  return store
}

describe('OverlayPicker', () => {
  it('lists None plus every diatonic chord of the scale', () => {
    const store = scaleStore()
    const w = mount(OverlayPicker)
    const options = w.findAll('option')
    expect(options[0]!.text()).toBe('None')
    expect(options).toHaveLength(store.overlayChords.length + 1)
    expect(options[1]!.attributes('value')).toBe('1-major')
    expect(options[1]!.text()).toBe('I · C')
  })

  it('labels chords with their roman numeral and notation glyphs', () => {
    scaleStore('F#')
    const w = mount(OverlayPicker)
    const texts = w.findAll('option').map(o => o.text())
    expect(texts).toContain('ii7 · G♯m7')
    expect(texts).toContain('viiø7 · E♯m7♭5')
    expect(texts).toContain('V7 · C♯7')
  })

  it('writes the selection to the store', async () => {
    const store = scaleStore()
    const w = mount(OverlayPicker)
    await w.find('select').setValue('2-m7')
    expect(store.overlay).toBe('2-m7')
    expect(store.overlayChord).toMatchObject({ root: 'D', typeId: 'm7' })
  })
})
