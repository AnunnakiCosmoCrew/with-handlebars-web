import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  STANDARD_TUNING,
  identifyPosition,
  selectionPitches,
} from '@anunnakicosmocrew/handlebars'
import StaffView from '../src/components/StaffView.vue'

const eMajor = { mode: 'chord', root: 'E', typeId: 'major' } as const
const pitches = selectionPitches(STANDARD_TUNING, eMajor)

const mountStaff = (props: Record<string, unknown> = {}) =>
  mount(StaffView, { props: { pitches, tuning: STANDARD_TUNING, ...props } })

describe('StaffView', () => {
  it('renders one notehead per exact pitch, roots marked', () => {
    const w = mountStaff()
    expect(w.findAll('.st-note')).toHaveLength(pitches.length)
    expect(w.findAll('.st-note-root')).toHaveLength(pitches.filter(p => p.isRoot).length)
    // sounding labels, octave-exact
    const labels = w.findAll('.st-note .st-pname').map(t => t.text())
    expect(labels[0]).toBe('E2')
    expect(labels).toContain('G♯3')
  })

  it('draws accidentals and ledger lines where the pitch needs them', () => {
    const w = mountStaff()
    const gSharp = w.findAll('.st-note').find(n => n.find('.st-pname').text() === 'G♯3')!
    expect(gSharp.find('.st-acc').text()).toBe('♯')
    // low open E (written E3) hangs three ledger lines below the staff
    const lowE = w.findAll('.st-note')[0]!
    expect(lowE.findAll('.st-ledger')).toHaveLength(3)
  })

  it('tints noteheads by role when a roles map is passed', () => {
    const roles = new Map(pitches.map(p => [p.midi, p.isRoot ? 'root' : 'third'] as const))
    roles.delete(47) // leave one pitch (B2) out of the frame
    roles.delete(52) // ...and one root (E3), to prove the map owns root tinting
    const w = mountStaff({ roles })
    const gSharp = w.find('.st-note[data-midi="44"]')
    expect(gSharp.classes()).toContain('st-note-role-third')
    expect(gSharp.attributes('data-role')).toBe('third')
    // labels never change, and unmapped notes stay untinted
    expect(gSharp.find('.st-pname').text()).toBe('G♯2')
    const b = w.find('.st-note[data-midi="47"]')
    expect(b.classes().some(c => c.startsWith('st-note-role-'))).toBe(false)
    expect(b.attributes('data-role')).toBeUndefined()
    // the map owns root tinting: mapped roots tint via their role class,
    // out-of-frame roots go neutral instead of keeping the isRoot color
    expect(w.find('.st-note[data-midi="40"]').classes()).toContain('st-note-role-root')
    const outOfFrameRoot = w.find('.st-note[data-midi="52"]')
    expect(outOfFrameRoot.classes()).not.toContain('st-note-root')
    expect(outOfFrameRoot.classes().some(c => c.startsWith('st-note-role-'))).toBe(false)
  })

  it('emits select with the sounding midi on click and keyboard', async () => {
    const w = mountStaff()
    await w.findAll('.st-note')[0]!.trigger('click')
    await w.findAll('.st-note')[1]!.trigger('keydown.enter')
    expect(w.emitted('select')).toEqual([[40], [44]])
  })

  it('rings the focused pitch, dims the rest, and captions its positions', () => {
    const w = mountStaff({ focused: 52 })
    expect(w.find('.staff-dimmed').exists()).toBe(true)
    const focused = w.find('.st-note-focused')
    expect(focused.find('.st-pname').text()).toBe('E3')
    expect(w.find('.staff-caption').text()).toContain('Written E4 · sounds E3')
    expect(w.find('.staff-caption').text()).toContain('3 positions')
    expect(w.find('.staff-caption').text()).toContain('string 4 (D) fret 2')
  })

  it('renders a ghost with its accidental and membership caption', () => {
    // high E string fret 2 = F#4, not an E major tone
    const ghost = {
      ...identifyPosition(STANDARD_TUNING, 5, 2, eMajor),
      string: 5,
      fret: 2,
    }
    const w = mountStaff({ ghost })
    expect(w.find('.st-ghost').exists()).toBe(true)
    expect(w.find('.st-ghost .st-acc').text()).toBe('♯')
    expect(w.find('.st-ghost .st-pname').text()).toBe('F♯4')
    expect(w.find('.staff-caption').text()).toContain('string 1 (E), fret 2')
    expect(w.find('.staff-caption').text()).toContain('not in the selection')
    // a ghost alone does not dim the inventory
    expect(w.find('.staff-dimmed').exists()).toBe(false)
  })

  it('invites the gesture without naming a mouse', () => {
    // one build serves the site and the app, so the resting caption cannot
    // say "click" to a thumb
    const caption = mountStaff().find('.staff-caption').text()
    expect(caption).toContain('to pin a pitch')
    expect(caption.toLowerCase()).not.toContain('click')
  })
})
