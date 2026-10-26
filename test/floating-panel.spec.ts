import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PANEL_GUTTER, clampShift } from '../src/composables/useFloatingPanel.js'
// The clamp is arithmetic plus two CSS declarations, and happy-dom lays nothing
// out — so the geometry is tested directly and the declarations are read as
// text, the way safe-areas.spec.ts reads the insets. The failure both exist to
// catch is invisible in a test runner with no viewport: drop either half and
// the panels quietly go back to hanging off the edge of a phone.
import displayOptions from '../src/components/DisplayOptions.vue?raw'
import comboSelect from '../src/components/ui/ComboSelect.vue?raw'
import tuningPicker from '../src/components/TuningPicker.vue?raw'

// Read off disk rather than imported: Vitest leaves CSS unprocessed, so
// `../src/style.css?raw` arrives empty and the token assertion would pass by
// saying nothing. Anchored on the project root vitest runs in.
const tokens = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8')

// One rule, from its brace to the first `}`. All three are flat. The trailing
// `\s*\{` is what keeps `.combo-panel` from matching `.combo-panel-inline {`.
const rule = (source: string, selector: string) =>
  source.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))?.[0] ?? ''

const panels = [
  { name: 'DisplayOptions', source: displayOptions, selector: '.display-panel' },
  { name: 'ComboSelect', source: comboSelect, selector: '.combo-panel' },
  { name: 'TuningPicker', source: tuningPicker, selector: '.tuning-dialog' },
] as const

describe('clampShift', () => {
  it('leaves a panel that already fits where the stylesheet put it', () => {
    expect(clampShift({ left: 40, width: 240 }, 402)).toBe(0)
  })

  it('answers zero when there is no layout to measure', () => {
    // happy-dom hands every element a zeroed box, and so does a display:none
    // subtree. Shifting by a number derived from that would move panels that
    // are perfectly placed, so "unknown" has to mean "leave it alone".
    expect(clampShift({ left: 0, width: 0 }, 1024)).toBe(0)
    expect(clampShift({ left: 226, width: 314 }, 0)).toBe(0)
  })

  it('slides a panel that overflows the right edge back inside (UX-02)', () => {
    // The scale dropdown: 314 px wide with its right edge at 540 in a 402 px
    // viewport. After the shift the right edge lands on 402 − 16.
    const shift = clampShift({ left: 226, width: 314 }, 402)
    expect(shift).toBe(-154)
    expect(226 + shift + 314).toBe(402 - PANEL_GUTTER)
  })

  it('slides a panel that overflows the left edge back inside (UX-01)', () => {
    // The Display popover: spans −122…118 when its trigger wraps to the start
    // of a row. After the shift the left edge sits on the gutter.
    const shift = clampShift({ left: -122, width: 240 }, 402)
    expect(shift).toBe(138)
    expect(-122 + shift).toBe(PANEL_GUTTER)
  })

  it('pins a panel too wide for the gap to the left edge', () => {
    // --hb-panel-max-width should have prevented this; if it did not, the start
    // of a list is worth more than its end.
    expect(40 + clampShift({ left: 40, width: 500 }, 402)).toBe(PANEL_GUTTER)
  })
})

describe('floating panel CSS', () => {
  it('caps a panel against the window, not its trigger', () => {
    expect(tokens).toContain('--hb-panel-max-width:')
    const value = tokens.match(/--hb-panel-max-width:[^;]*/)?.[0] ?? ''
    expect(value).toContain('100vw')
  })

  it('subtracts exactly two gutters from the cap', () => {
    // The cap and PANEL_GUTTER are one gap seen from two sides: a panel sized to
    // the cap must still fit between the gutters the clamp keeps. Read as a
    // number rather than matched as text, and required to be px — a rem here
    // would drift from the constant with the root font size, and a cap wider
    // than two gutters puts the panel straight back over the edge.
    const subtracted = tokens.match(/--hb-panel-max-width:[^;]*?-\s*(\d+)px\s*\)/)?.[1]
    expect(subtracted).toBeDefined()
    expect(Number(subtracted)).toBe(PANEL_GUTTER * 2)
  })

  it.each(panels)('$name clamps and accepts the measured shift', ({ source, selector }) => {
    const declarations = rule(source, selector)
    expect(declarations).toContain('max-width: var(--hb-panel-max-width)')
    // Spent on an inset, never a transform: a transform moves the pixels but
    // leaves the original box in the document's scrollable area, which is the
    // sideways page drag UX-02 is about.
    expect(declarations).toMatch(/(left|right):[^;]*var\(--hb-panel-shift/)
    expect(declarations).not.toContain('transform:')
  })

  it('leaves the inline combo panel unclamped', () => {
    // Inline renders inside a host's dialog, which clamps itself; capping again
    // would cap the content twice. Static positioning ignores the inset.
    const inline = rule(comboSelect, '.combo-panel-inline')
    expect(inline).toContain('position: static')
    expect(inline).toContain('max-width: none')
  })
})
