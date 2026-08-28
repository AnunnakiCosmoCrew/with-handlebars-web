import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { getSelectionInfo } from '@anunnakicosmocrew/handlebars'
import InfoPanel from '../src/components/InfoPanel.vue'

describe('InfoPanel', () => {
  it('renders a chord with aliases and glyph formatting', () => {
    const info = getSelectionInfo({ mode: 'chord', root: 'E', typeId: 'maj7' })
    const w = mount(InfoPanel, { props: { info, mode: 'chord' } })
    expect(w.get('h2').text()).toBe('Emaj7')
    expect(w.text()).toContain('EMaj7, EM7')
    expect(w.text()).toContain('1, 3, 5, 7')
    expect(w.text()).toContain('4-3-4')
    expect(w.text()).toContain('E, G♯, B, D♯')
  })

  it('shows both half-step rows when tones are optional', () => {
    const info = getSelectionInfo({ mode: 'chord', root: 'E', typeId: '6-9' })
    const w = mount(InfoPanel, { props: { info, mode: 'chord' } })
    expect(w.text()).toContain('1, 3, (5), 6, 9')
    expect(w.text()).toContain('4-5-5')
    expect(w.text()).toContain('(excl. optional)')
    expect(w.text()).toContain('4-3-2-5')
    expect(w.text()).toContain('(incl. optional)')
    expect(w.text()).toContain('E, G♯, (B), C♯, F♯')
  })

  it('renders scales without aliases and with octave-closing half-steps', () => {
    const info = getSelectionInfo({ mode: 'scale', root: 'E', typeId: 'major' })
    const w = mount(InfoPanel, { props: { info, mode: 'scale' } })
    expect(w.get('h2').text()).toBe('E Major')
    expect(w.text()).not.toContain('a.k.a.')
    expect(w.text()).toContain('2-2-1-2-2-2-1')
  })

  it('formats double sharps in strict spelling', () => {
    const info = getSelectionInfo({ mode: 'chord', root: 'E', typeId: '7s9' })
    const w = mount(InfoPanel, { props: { info, mode: 'chord' } })
    expect(w.get('h2').text()).toBe('E7♯9')
    expect(w.text()).toContain('Fx')
  })
})
