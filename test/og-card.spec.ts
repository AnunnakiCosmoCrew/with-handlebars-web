import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OgCard from '../src/og/OgCard.vue'

beforeEach(() => {
  history.replaceState(null, '', '/')
})

describe('OgCard', () => {
  it('renders the card the site ships when the query is empty', () => {
    const w = mount(OgCard)
    expect(w.text()).toContain('A Pentatonic Minor')
    expect(w.text()).toContain('24 frets')
    expect(w.text()).toContain('withhandlebars.com')
  })

  // The card reads the query with the room's own parser: chord vs scale comes
  // from which param is present, exactly as in a shareable room link.
  it('renders a chord card from a room chord link', () => {
    history.replaceState(null, '', '/?root=E&chord=maj7')
    const w = mount(OgCard)
    expect(w.text()).toContain('Emaj7')
    expect(w.text()).not.toContain('Pentatonic')
  })

  // Fields the query leaves out keep the card's own defaults — here, the root.
  it('takes tuning and fret count from a room query', () => {
    history.replaceState(null, '', '/?scale=blues&tuning=drop-d&frets=12')
    const w = mount(OgCard)
    expect(w.text()).toContain('A Blues')
    expect(w.text()).toContain('D A D G B E · 12 frets')
  })

  it('drops the role legend when roles are off', () => {
    const w1 = mount(OgCard)
    expect(w1.text()).toContain('Root')
    history.replaceState(null, '', '/?roles=off')
    const w2 = mount(OgCard)
    expect(w2.find('.legend').exists()).toBe(false)
  })

  // HB-155: the build photographs one card per board page, named by its path.
  it('renders the board a board path names', () => {
    history.replaceState(null, '', '/og.html?board=/standard/c-sharp/chord/7-sharp-9/')
    const w = mount(OgCard)
    expect(w.text()).toContain('C#7#9')
    expect(w.text()).toContain('E A D G B E · 24 frets')
    expect(w.text()).not.toContain('Pentatonic')
  })

  it('takes the board over the query, and falls back to it for a path with no page', () => {
    history.replaceState(null, '', '/og.html?board=/standard/e/scale/dorian/&root=G&chord=maj7')
    expect(mount(OgCard).text()).toContain('E Dorian')
    history.replaceState(null, '', '/og.html?board=/standard/h/scale/dorian/&root=G&chord=maj7')
    expect(mount(OgCard).text()).toContain('Gmaj7')
  })

  it('draws the 16:9 frame for size=wide and the Open Graph frame otherwise', () => {
    history.replaceState(null, '', '/og.html?board=/standard/e/scale/dorian/&size=wide')
    expect(mount(OgCard).find('.card').classes()).toContain('wide')
    history.replaceState(null, '', '/og.html?board=/standard/e/scale/dorian/')
    expect(mount(OgCard).find('.card').classes()).not.toContain('wide')
  })
})
