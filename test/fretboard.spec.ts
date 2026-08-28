import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  STANDARD_TUNING,
  getFretboardDots,
  getTuning,
  selectionBoxes,
} from '@anunnakicosmocrew/handlebars'
import Fretboard from '../src/components/Fretboard.vue'
import {
  boardWidth,
  dotX,
  stringY,
  type Handedness,
  type StringOrder,
} from '../src/components/fretboard-geometry.js'

const eMajorDots = getFretboardDots(STANDARD_TUNING, {
  mode: 'chord',
  root: 'E',
  typeId: 'major',
})

const mountBoard = (props: Record<string, unknown> = {}) =>
  mount(Fretboard, {
    props: { tuning: STANDARD_TUNING, dots: eMajorDots, ...props },
  })

describe('Fretboard', () => {
  it('renders six strings, six tuners, and the nut', () => {
    const w = mountBoard()
    expect(w.findAll('.fb-string')).toHaveLength(6)
    expect(w.findAll('.fb-tuner')).toHaveLength(6)
    expect(w.find('.fb-nut').exists()).toBe(true)
    expect(w.findAll('.fb-fret-wire')).toHaveLength(12)
  })

  it('renders one dot per FretDot with root/normal classes', () => {
    const w = mountBoard()
    expect(w.findAll('.fb-dot')).toHaveLength(eMajorDots.length)
    expect(w.findAll('.fb-dot-root').length).toBe(eMajorDots.filter(d => d.isRoot).length)
    expect(w.findAll('.fb-dot-optional')).toHaveLength(0)
  })

  it('marks optional tones with the optional dot style', () => {
    const dots = getFretboardDots(STANDARD_TUNING, { mode: 'chord', root: 'E', typeId: '9' })
    const w = mountBoard({ dots })
    expect(w.findAll('.fb-dot-optional').length).toBe(dots.filter(d => d.isOptional).length)
    expect(w.findAll('.fb-dot-optional').length).toBeGreaterThan(0)
  })

  it('labels dots with note names or intervals', async () => {
    const w = mountBoard()
    expect(w.findAll('.fb-dot text').map(t => t.text())).toContain('G♯')
    await w.setProps({ labelMode: 'intervals' })
    const labels = w.findAll('.fb-dot text').map(t => t.text())
    expect(labels).toContain('3')
    expect(labels).not.toContain('G♯')
  })

  it('shows fret numbers at 3, 5, 7, 9, 12 and a double marker at 12', () => {
    const w = mountBoard()
    expect(w.findAll('.fb-fret-number').map(t => t.text())).toEqual(['3', '5', '7', '9', '12'])
    const markers = w.findAll('.fb-marker')
    expect(markers).toHaveLength(5)
    expect(markers.at(4)!.attributes('data-fret')).toBe('12')
    expect(markers.at(4)!.findAll('circle')).toHaveLength(2)
    expect(markers.at(0)!.findAll('circle')).toHaveLength(1)
  })

  it('renders a longer neck when fretCount grows', () => {
    const dots = getFretboardDots(
      STANDARD_TUNING,
      { mode: 'chord', root: 'E', typeId: 'major' },
      'strict',
      24,
    )
    const w = mountBoard({ dots, fretCount: 24 })
    expect(w.findAll('.fb-fret-wire')).toHaveLength(24)
    expect(w.findAll('.fb-fret-number').map(t => t.text())).toEqual([
      '3', '5', '7', '9', '12', '15', '17', '19', '21', '24',
    ])
    const markers = w.findAll('.fb-marker')
    expect(markers.at(-1)!.attributes('data-fret')).toBe('24')
    expect(markers.at(-1)!.findAll('circle')).toHaveLength(2)
    expect(w.findAll('.fb-dot')).toHaveLength(dots.length)
    expect(dots.some(d => d.fret > 12)).toBe(true)
  })

  it('tints dots by role when a roles map is passed, labels untouched', async () => {
    const dots = getFretboardDots(STANDARD_TUNING, { mode: 'chord', root: 'E', typeId: '7' })
    const roles = new Map(dots.map(d => [`${d.string}:${d.fret}`, d.role]))
    const w = mountBoard({ dots, roles })
    const gsharp = w.find('.fb-dot[data-string="0"][data-fret="4"]')
    expect(gsharp.classes()).toContain('fb-dot-role-third')
    expect(gsharp.attributes('data-role')).toBe('third')
    const root = w.find('.fb-dot[data-string="0"][data-fret="0"]')
    expect(root.attributes('data-role')).toBe('root')
    expect(root.classes()).toContain('fb-dot-role-root')
    // roles never change what the label says, in either label mode
    expect(gsharp.find('text').text()).toBe('G♯')
    await w.setProps({ labelMode: 'intervals' })
    expect(w.find('.fb-dot[data-string="0"][data-fret="4"]').find('text').text()).toBe('3')
  })

  it('leaves unmapped dots untinted when the roles map is partial', () => {
    const roles = new Map([['0:0', 'root' as const]])
    const w = mountBoard({ roles })
    expect(w.findAll('[data-role]')).toHaveLength(1)
    const other = w.find('.fb-dot[data-string="0"][data-fret="4"]')
    expect(other.classes().some(c => c.startsWith('fb-dot-role-'))).toBe(false)
    // an out-of-frame root goes neutral — the map owns root tinting too
    const outOfFrameRoot = w.find('.fb-dot[data-string="0"][data-fret="12"]')
    expect(outOfFrameRoot.classes()).not.toContain('fb-dot-root')
    expect(outOfFrameRoot.classes()).toContain('fb-dot-normal')
  })

  it('emits selectPitch from dots and cell from empty positions', async () => {
    const w = mountBoard()
    await w.find('.fb-dot[data-midi="52"]').trigger('click')
    // the D-string fret-3 cell (F3) holds no dot
    await w.find('.fb-cell[data-string="2"][data-fret="3"]').trigger('click')
    expect(w.emitted('selectPitch')).toEqual([[52]])
    expect(w.emitted('cell')).toEqual([[2, 3]])
  })

  it('rings every position of the focused pitch and dims the rest', () => {
    const w = mountBoard({ focusedMidi: 52 })
    expect(w.find('.fb-focus-dim').exists()).toBe(true)
    const hits = w.findAll('.fb-dot-hit')
    expect(
      hits.map(d => [d.attributes('data-string'), d.attributes('data-fret')]),
    ).toEqual([
      ['0', '12'],
      ['1', '7'],
      ['2', '2'],
    ])
  })

  const eMajorBoxes = selectionBoxes(STANDARD_TUNING, {
    mode: 'chord',
    root: 'E',
    typeId: 'major',
  })

  it('outlines the active box and dims dots outside it', () => {
    // box 2: anchor fret 4, spans [4, 8]
    const w = mountBoard({ box: eMajorBoxes[1] })
    expect(w.find('.fb-box-dim').exists()).toBe(true)
    expect(w.findAll('.fb-box-outline')).toHaveLength(1)
    const inDot = w.find('.fb-dot[data-string="0"][data-fret="4"]')
    const outDot = w.find('.fb-dot[data-string="0"][data-fret="0"]')
    expect(inDot.classes()).toContain('fb-dot-inbox')
    expect(outDot.classes()).not.toContain('fb-dot-inbox')
  })

  it('outlines a high position on a long neck where it sits, not at its octave', () => {
    const boxes = selectionBoxes(
      STANDARD_TUNING,
      { mode: 'chord', root: 'E', typeId: 'major' },
      24,
    )
    const dots = getFretboardDots(
      STANDARD_TUNING,
      { mode: 'chord', root: 'E', typeId: 'major' },
      'strict',
      24,
    )
    // box 4 on the 24-fret neck is the octave of box 1: frets 12–16 only
    const box4 = boxes[3]!
    expect(box4).toMatchObject({ minFret: 12, maxFret: 16 })
    const w = mountBoard({ dots, fretCount: 24, box: box4 })
    expect(w.findAll('.fb-box-outline')).toHaveLength(1)
    expect(
      w.find('.fb-dot[data-string="0"][data-fret="12"]').classes(),
    ).toContain('fb-dot-inbox')
    expect(
      w.find('.fb-dot[data-string="0"][data-fret="0"]').classes(),
    ).not.toContain('fb-dot-inbox')
  })

  it('mirrors the box outline for left-handed boards', () => {
    const right = mountBoard({ box: eMajorBoxes[1] })
    const left = mountBoard({ box: eMajorBoxes[1], handedness: 'left' })
    const span = (w: ReturnType<typeof mountBoard>) => {
      const r = w.find('.fb-box-outline')
      return [Number(r.attributes('x')), Number(r.attributes('width'))] as const
    }
    const [rx, rw] = span(right)
    const [lx, lw] = span(left)
    expect(lw).toBeCloseTo(rw)
    expect(lx + lw).toBeCloseTo(boardWidth(12) - rx)
  })

  it('dims by pattern keys without drawing a rectangle', () => {
    const w = mountBoard({ shapeKeys: new Set(['0:0', '1:2']) })
    expect(w.find('.fb-box-dim').exists()).toBe(true)
    expect(w.find('.fb-box-outline').exists()).toBe(false)
    expect(w.find('.fb-dot[data-string="0"][data-fret="0"]').classes()).toContain(
      'fb-dot-inbox',
    )
    expect(w.find('.fb-dot[data-string="0"][data-fret="4"]').classes()).not.toContain(
      'fb-dot-inbox',
    )
  })

  it('rings overlay dots by their string:fret keys', () => {
    const w = mountBoard({ overlayKeys: new Set(['0:0', '1:2']) })
    const rung = w.findAll('.fb-dot-overlay')
    expect(
      rung.map(d => `${d.attributes('data-string')}:${d.attributes('data-fret')}`),
    ).toEqual(['0:0', '1:2'])
    expect(w.find('.fb-dot[data-string="0"][data-fret="0"]').attributes('data-overlay')).toBe(
      'true',
    )
  })

  it('draws octave connector lines through the dot geometry', () => {
    const links = [
      { from: { string: 0, fret: 0, midi: 40 }, to: { string: 2, fret: 2, midi: 52 } },
      { from: { string: 1, fret: 7, midi: 52 }, to: { string: 3, fret: 9, midi: 64 } },
    ]
    const w = mountBoard({ links })
    const lines = w.findAll('.fb-octave-line')
    expect(lines).toHaveLength(2)
    const first = lines.at(0)!
    expect(Number(first.attributes('x1'))).toBeCloseTo(dotX(0, 'right', boardWidth(12)))
    expect(Number(first.attributes('y2'))).toBeCloseTo(stringY(2, 6, 'bass-bottom'))
  })

  it('mirrors the connector lines for left-handed boards', () => {
    const links = [
      { from: { string: 0, fret: 0, midi: 40 }, to: { string: 2, fret: 2, midi: 52 } },
    ]
    const x1 = (w: ReturnType<typeof mountBoard>) =>
      Number(w.find('.fb-octave-line').attributes('x1'))
    expect(x1(mountBoard({ links })) + x1(mountBoard({ links, handedness: 'left' }))).toBeCloseTo(
      boardWidth(12),
    )
  })

  it('renders a dashed ghost at an identified empty position', () => {
    const w = mountBoard({ ghost: { string: 2, fret: 3, name: 'F' } })
    expect(w.find('.fb-ghost').exists()).toBe(true)
    expect(w.find('.fb-ghost text').text()).toBe('F')
    const gx = Number(w.find('.fb-ghost circle').attributes('cx'))
    expect(gx).toBeCloseTo(dotX(3, 'right', boardWidth(12)))
  })

  const combos: Array<[Handedness, StringOrder]> = [
    ['right', 'bass-bottom'],
    ['right', 'bass-top'],
    ['left', 'bass-bottom'],
    ['left', 'bass-top'],
  ]
  it.each(combos)('places dots correctly for %s-handed, %s', (handedness, stringOrder) => {
    const w = mountBoard({ handedness, stringOrder })
    const width = boardWidth(12)
    // The G# on the low E string, 4th fret, must land exactly where the
    // geometry transforms say — one layout, transformed coordinates.
    const dot = w
      .findAll('.fb-dot')
      .find(d => d.attributes('data-string') === '0' && d.attributes('data-fret') === '4')!
    const circle = dot.find('circle')
    expect(Number(circle.attributes('cx'))).toBeCloseTo(dotX(4, handedness, width))
    expect(Number(circle.attributes('cy'))).toBeCloseTo(stringY(0, 6, stringOrder))
  })

  it('mirrors horizontally between handedness settings', () => {
    const right = mountBoard({ handedness: 'right' })
    const left = mountBoard({ handedness: 'left' })
    const cx = (w: ReturnType<typeof mountBoard>) =>
      Number(
        w
          .findAll('.fb-dot')
          .find(d => d.attributes('data-string') === '0' && d.attributes('data-fret') === '4')!
          .find('circle')
          .attributes('cx'),
      )
    expect(cx(right) + cx(left)).toBeCloseTo(boardWidth(12))
  })

  it('flips rows between string orders', () => {
    const bottom = mountBoard({ stringOrder: 'bass-bottom' })
    const top = mountBoard({ stringOrder: 'bass-top' })
    const y = (w: ReturnType<typeof mountBoard>, s: string) =>
      Number(w.find(`.fb-string[data-string="${s}"]`).attributes('y1'))
    // bass-bottom: low string below high string; bass-top: reversed
    expect(y(bottom, '0')).toBeGreaterThan(y(bottom, '5'))
    expect(y(top, '0')).toBeLessThan(y(top, '5'))
  })

  it('marks altered strings red via class', () => {
    const w = mountBoard({ offsets: [-2, 0, 0, 0, 0, 0] })
    expect(w.find('.fb-string[data-string="0"]').classes()).toContain('fb-string-altered')
    expect(w.find('.fb-string[data-string="1"]').classes()).not.toContain('fb-string-altered')
  })

  it('emits tune events from the ± buttons', async () => {
    const w = mountBoard()
    const tuner = w.find('.fb-tuner[data-string="2"]')
    await tuner.find('.fb-tuner-up').trigger('click')
    await tuner.find('.fb-tuner-down').trigger('click')
    expect(w.emitted('tune')).toEqual([
      [2, 1],
      [2, -1],
    ])
  })

  it('supports keyboard activation on tuners', async () => {
    const w = mountBoard()
    await w.find('.fb-tuner[data-string="0"] .fb-tuner-up').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('tune')).toEqual([[0, 1]])
  })

  it('blanks every label in quiz mode and lets taps fall through the dots', () => {
    const w = mountBoard({ hideLabels: true, passiveDots: true })
    const texts = w.findAll('.fb-dot text').map(t => t.text())
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every(t => t === '')).toBe(true)
    expect(w.find('.fb-dot').classes()).toContain('fb-dot-passive')
    // both default off: the ordinary board is unchanged
    const plain = mountBoard()
    expect(plain.findAll('.fb-dot text').some(t => t.text() !== '')).toBe(true)
    expect(plain.find('.fb-dot').classes()).not.toContain('fb-dot-passive')
  })

  it('rings quiz-reveal marks whether or not a dot sits there', () => {
    const w = mountBoard({ marks: [{ string: 0, fret: 3 }, { string: 5, fret: 1 }] })
    expect(w.findAll('.fb-mark')).toHaveLength(2)
    expect(mountBoard().findAll('.fb-mark')).toHaveLength(0)
  })

  it('renders a 7-string tuning without special-casing', () => {
    // Variable string count is a planned post-parity feature; the component
    // must already be agnostic to it.
    const base = getTuning('standard')
    const seven = {
      id: 'seven',
      name: 'Seven',
      strings: [35, ...base.strings],
      letters: ['B', ...base.letters],
    }
    const w = mount(Fretboard, {
      props: {
        tuning: seven,
        dots: getFretboardDots(seven, { mode: 'chord', root: 'E', typeId: 'major' }),
      },
    })
    expect(w.findAll('.fb-string')).toHaveLength(7)
    expect(w.findAll('.fb-tuner')).toHaveLength(7)
  })
})
