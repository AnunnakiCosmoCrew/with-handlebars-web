import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import CircleOfFifths from '../src/components/CircleOfFifths.vue'
import { withNarrowViewport } from './match-media.js'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

describe('CircleOfFifths', () => {
  it('renders both rings with key signatures and boundary twins', () => {
    useRoomStore()
    const w = mount(CircleOfFifths)
    expect(w.findAll('[data-circle-major]')).toHaveLength(12)
    expect(w.findAll('[data-circle-minor]')).toHaveLength(12)
    expect(w.find('[data-circle-major="6"]').text()).toContain('F♯/G♭')
    expect(w.find('[data-circle-major="1"]').text()).toContain('1♯')
    expect(w.find('[data-circle-major="10"]').text()).toContain('2♭')
    expect(w.find('[data-circle-major="0"]').text()).toBe('C')
    expect(w.find('[data-circle-minor="0"]').text()).toBe('Am')
  })

  it('notates each key signature on a tiny treble staff', () => {
    useRoomStore()
    const w = mount(CircleOfFifths)
    expect(w.findAll('[data-circle-sig]')).toHaveLength(12)
    const accsOf = (i: number) =>
      w.find(`[data-circle-sig="${i}"]`).findAll('.cof-acc').map(t => t.text())
    expect(accsOf(0)).toEqual([]) // C: bare staff and clef
    expect(accsOf(1)).toEqual(['♯']) // G
    expect(accsOf(11)).toEqual(['♭']) // F
    expect(accsOf(5)).toEqual(['♯', '♯', '♯', '♯', '♯']) // B, 5 sharps
    expect(accsOf(7)).toEqual(['♭', '♭', '♭', '♭', '♭']) // Db, 5 flats
    // every mini staff carries its clef and five lines
    const c = w.find('[data-circle-sig="0"]')
    expect(c.find('.cof-clef').text()).toBe('𝄞')
    expect(c.findAll('.cof-staff-line')).toHaveLength(5)
  })

  it('paints each segment with its own hue around the wheel', () => {
    useRoomStore()
    const w = mount(CircleOfFifths)
    expect(w.find('[data-circle-major="0"]').attributes('style')).toContain('--cof-hue: 0')
    expect(w.find('[data-circle-major="1"]').attributes('style')).toContain('--cof-hue: 30')
    expect(w.find('[data-circle-minor="11"]').attributes('style')).toContain('--cof-hue: 330')
  })

  it('marks the current key on the right ring and names it in the center', async () => {
    const store = useRoomStore() // E major chord
    const w = mount(CircleOfFifths)
    expect(w.find('[data-circle-major="4"]').classes()).toContain('cof-active')
    expect(w.find('[data-circle-major="4"]').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-circle-minor="4"]').classes()).not.toContain('cof-active')
    expect(w.find('[data-circle-minor="4"]').attributes('aria-pressed')).toBe('false')
    expect(w.find('[data-circle-center]').text()).toBe('E')
    store.chordId = 'm7'
    await w.vm.$nextTick()
    expect(w.find('[data-circle-minor="1"]').classes()).toContain('cof-active')
    expect(w.find('[data-circle-major="1"]').classes()).not.toContain('cof-active')
    expect(w.find('[data-circle-center]').text()).toBe('Em')
  })

  it('tints the diatonic neighborhood in scale mode only', async () => {
    const store = useRoomStore()
    const w = mount(CircleOfFifths)
    expect(w.findAll('.cof-diatonic')).toHaveLength(0)
    store.mode = 'scale' // E major: A/E/B majors + their relative minors
    await w.vm.$nextTick()
    const lit = w
      .findAll('[data-circle-major]')
      .flatMap(g => (g.classes().includes('cof-diatonic') ? [g.attributes('data-circle-major')] : []))
    expect(lit).toEqual(['3', '4', '5'])
    expect(w.findAll('.cof-diatonic')).toHaveLength(6)
  })

  it('navigates to the clicked key on either ring', async () => {
    const store = useRoomStore()
    const w = mount(CircleOfFifths)
    await w.find('[data-circle-major="1"]').trigger('click')
    expect(store.root).toBe('G')
    expect(store.chordId).toBe('major')
    store.mode = 'scale'
    await w.find('[data-circle-minor="0"]').trigger('click')
    expect(store.root).toBe('A')
    expect(store.scaleId).toBe('aeolian')
    await w.find('[data-circle-major="7"]').trigger('keydown.enter')
    expect(store.root).toBe('Db')
    expect(store.scaleId).toBe('major')
  })

  it('hides when the display option says so', async () => {
    const store = useRoomStore()
    const w = mount(CircleOfFifths)
    expect(w.find('.circle-panel').exists()).toBe(true)
    store.circle = 'hide'
    await w.vm.$nextTick()
    expect(w.find('.circle-panel').exists()).toBe(false)
  })

  it('trades the mini staves for a bigger wheel on a phone', () => {
    useRoomStore()
    const box = (w: VueWrapper) =>
      w.find('.circle-svg').attributes('viewBox')!.split(' ').map(Number) as number[]

    const full = mount(CircleOfFifths)
    expect(box(full)).toEqual([0, 0, 470, 470])
    expect(full.findAll('[data-circle-sig]')).toHaveLength(12)

    withNarrowViewport(() => {
      const phone = mount(CircleOfFifths)
      // the staves go, and the width they reserved goes back to the wedges:
      // the tighter viewBox is what enlarges every name on the wheel
      expect(phone.findAll('[data-circle-sig]')).toHaveLength(0)
      const [x, y, w, h] = box(phone) as [number, number, number, number]
      expect(w).toBeLessThan(470)
      expect(h).toBe(w)
      // still centred on the wheel, and still holding all of it
      expect(x + w / 2).toBe(235)
      expect(y + h / 2).toBe(235)
      expect(w / 2).toBeGreaterThan(165) // the outer wedge radius
      // both rings are still there to tap
      expect(phone.findAll('[data-circle-major]')).toHaveLength(12)
      expect(phone.findAll('[data-circle-minor]')).toHaveLength(12)
      expect(phone.find('.circle-svg').classes()).toContain('circle-compact')
    })
  })

  it('names the gesture without naming a mouse', () => {
    useRoomStore()
    const label = mount(CircleOfFifths).find('.circle-svg').attributes('aria-label')!
    expect(label).toContain('Circle of fifths')
    expect(label.toLowerCase()).not.toContain('click')
  })
})
