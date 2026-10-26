import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// Tap sizes are CSS, and no test runner has a fingertip: happy-dom evaluates
// neither scoped styles nor `@media (pointer: coarse)`, so these read the
// sources as text. The failure they exist to catch is silent — the room looks
// exactly the same in a desktop browser whether the layer is there or not.
import comboSelect from '../src/components/ui/ComboSelect.vue?raw'
import neckLensPicker from '../src/components/NeckLensPicker.vue?raw'
import playbackControls from '../src/components/PlaybackControls.vue?raw'
import positionPicker from '../src/components/PositionPicker.vue?raw'
import practicePanel from '../src/components/PracticePanel.vue?raw'

// Read off disk, not imported: Vitest leaves CSS unprocessed, so
// `../src/style.css?raw` arrives as an empty string and every assertion below
// would pass by saying nothing (same reasoning as safe-areas.spec.ts).
const tokens = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8')

/** The `@media (pointer: coarse)` block, brace-matched from its opening `{`. */
function coarseLayer(css: string): string {
  const at = css.indexOf('@media (pointer: coarse)')
  if (at === -1) return ''
  const from = css.indexOf('{', at)
  // No brace after the query means no block to read. Bail rather than start
  // the scan at -1, which would count from the top of the file and hand back
  // some other rule's braces — a wrong layer reads as a passing test.
  if (from === -1) return ''
  let depth = 0
  for (let i = from; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(from, i + 1)
  }
  return ''
}

const layer = coarseLayer(tokens)

describe('tap targets', () => {
  it('defines the tap minimum as a token', () => {
    // 44 pt is the HIG minimum; on this viewport 1 CSS px is 1 pt.
    expect(tokens).toContain('--hb-tap-min: 44px;')
  })

  it('spends it in a coarse-pointer layer', () => {
    // Keyed on the pointer, not the viewport: a desktop window dragged to
    // phone width keeps its density, an iPad in landscape keeps the floor.
    expect(layer).not.toBe('')
    expect(layer).toContain('var(--hb-tap-min)')
  })

  // One entry per control the iOS audit measured under 44 pt (UX-05, UX-06,
  // UX-08, UX-09). A selector dropped from the layer is a control that
  // silently goes back to being padding-sized.
  const controls = [
    '.mode-toggle button',
    '.combo-button',
    '.combo-search',
    '.tuning-header',
    '.display-button',
    '.share-button',
    '.overlay-select',
    '.play-button',
    '.lens-btn',
    '.position-btn',
    '.ccard-head',
    "[role='option']",
    "input[type='range']",
    '.display-panel label',
    '.site-footer a',
  ]

  it.each(controls)('%s is in the layer', selector => {
    expect(layer).toContain(selector)
  })

  it('gives the icon-only header buttons a width as well', () => {
    // HB-86 drops the words from Share and Display under 640px; an icon in
    // padding is ~37px wide, and a height floor does not see that.
    expect(layer).toMatch(/\.share-button,\s*\n\s*\.display-button \{[^}]*min-width: var\(--hb-tap-min\)/)
  })

  it('gives the one- and two-character chips a width as well', () => {
    // "All", "3", "·": a height-only floor leaves them a sliver wide. The
    // chips declare their own min-width, and a scoped rule carries the
    // component's data attribute — it outranks anything the layer says
    // directly — so the width is raised through the token instead.
    expect(tokens).toContain('--hb-chip-min: 2.1rem;')
    expect(layer).toMatch(/:root\s*\{\s*--hb-chip-min:\s*var\(--hb-tap-min\)/)
  })

  it.each([
    { name: 'NeckLensPicker.vue', selector: '.lens-btn', source: neckLensPicker },
    { name: 'PositionPicker.vue', selector: '.position-btn', source: positionPicker },
    { name: 'PracticePanel.vue', selector: '.lens-btn', source: practicePanel },
  ])('$name sizes $selector from the chip token', ({ selector, source }) => {
    const rule = source.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))?.[0] ?? ''
    expect(rule).toContain('min-width: var(--hb-chip-min)')
  })

  it('keeps the tap minimum out of the components', () => {
    // ADR-0006: the floor is decided in one place. A component that reaches
    // for --hb-tap-min itself is a control with two sizes again — and the
    // second one is invisible from here.
    const sources = [comboSelect, playbackControls, neckLensPicker, positionPicker, practicePanel]
    for (const source of sources) expect(source).not.toContain('--hb-tap-min')
  })

  it('keeps a combo button on one line and lets its row wrap', () => {
    // UX-16: "Electric Guitar (Jazz)" wrapped to three lines and left the
    // playback row a head taller than its Play button.
    expect(comboSelect).toMatch(/\.combo-button\s*\{[^}]*white-space:\s*nowrap/)
    expect(playbackControls).toMatch(/\.playback\s*\{[^}]*flex-wrap:\s*wrap/)
  })
})
