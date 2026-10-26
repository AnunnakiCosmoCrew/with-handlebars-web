import { describe, expect, it } from 'vitest'
// Density is CSS and no test runner has a 402pt screen: happy-dom evaluates
// neither scoped styles nor media queries, so these read the sources as text —
// the convention tap-targets.spec.ts and safe-areas.spec.ts already follow.
// The failure they exist to catch is silent: drop the layer and the room looks
// exactly the same in a desktop browser, and the neck goes back below the fold.
import appVue from '../src/App.vue?raw'
import neckLensPicker from '../src/components/NeckLensPicker.vue?raw'
import displayOptions from '../src/components/DisplayOptions.vue?raw'
import positionPicker from '../src/components/PositionPicker.vue?raw'
import shareButton from '../src/components/ShareButton.vue?raw'
import tuningPicker from '../src/components/TuningPicker.vue?raw'

/** A media block, brace-matched from the `{` that opens it. */
function mediaBlock(css: string, query: string): string {
  const at = css.indexOf(query)
  if (at === -1) return ''
  const from = css.indexOf('{', at)
  // No brace after the query means no block to read. Bail rather than scan
  // from -1, which counts from the top of the file and hands back some other
  // rule's braces — a wrong block reads as a passing test.
  if (from === -1) return ''
  let depth = 0
  for (let i = from; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(from, i + 1)
  }
  return ''
}

const NARROW = '@media (max-width: 640px)'
const layer = mediaBlock(appVue, NARROW)

describe('above the fold', () => {
  it('puts the room’s density in one width-keyed layer', () => {
    // Width, not pointer: the tap floor asks whether a finger is doing this
    // (ADR-0006), density asks how much room there is (ADR-0007). A desktop
    // window dragged to 400px wraps exactly the way a phone does.
    expect(layer).not.toBe('')
    expect(appVue.match(/@media \(max-width: 640px\)/g) ?? []).toHaveLength(1)
  })

  it('gives each picker in the position area its own row', () => {
    expect(layer).toMatch(/\.room-positions\s*\{[^}]*flex-direction:\s*column/)
  })

  const rows = [
    { name: 'position', selector: '.room-positions :deep(.position-picker)' },
    { name: 'string', selector: '.room-positions :deep(.neck-lenses)' },
  ] as const

  it.each(rows)('scrolls the $name row instead of wrapping it', ({ selector }) => {
    expect(layer).toContain(selector)
    expect(layer).toContain('flex-wrap: nowrap;')
    expect(layer).toContain('overflow-x: auto;')
  })

  it('keeps the chips their own size inside a nowrap row', () => {
    // Without flex: none the chips share out the shortfall rather than
    // overflowing: the row never scrolls, and C2c's 44pt floor is undone in
    // the one place a thumb needs it most.
    expect(layer).toMatch(/:deep\(\.neck-lenses\) > \*\s*\{[^}]*flex:\s*none/)
  })

  it('bleeds the scrollers to the glass, safe areas and all', () => {
    // A row that stops cleanly inside the gutter looks finished. Ending on a
    // half-visible chip at the screen edge is what says "there is more" —
    // .board-scroll spends the insets the same way, for the same reason.
    expect(layer).toContain('margin-left: calc(-1rem - var(--hb-safe-left));')
    expect(layer).toContain('padding-right: calc(1rem + var(--hb-safe-right));')
  })

  // ADR-0007's stated cost: App.vue reaches into two children by class name,
  // so a rename over there silently drops that row's scroller. These are the
  // two names, checked from the components' side.
  it.each([
    { name: 'PositionPicker', source: positionPicker, cls: 'position-picker' },
    { name: 'NeckLensPicker', source: neckLensPicker, cls: 'neck-lenses' },
  ])('$name still answers to .$cls', ({ source, cls }) => {
    expect(source).toContain(`class="${cls}"`)
  })

  it('moves Share and Display into the header, and the tuning out of it', () => {
    // The header carries what acts on the room; the controls row carries what
    // changes the board. Four wrapped rows become two.
    const header = appVue.match(/<header class="room-header">[\s\S]*?<\/header>/)?.[0] ?? ''
    expect(header).toContain('<ShareButton />')
    expect(header).toContain('<DisplayOptions />')
    expect(header).not.toContain('<TuningPicker')

    const controls = appVue.match(/<div class="room-controls">[\s\S]*?<\/div>/)?.[0] ?? ''
    expect(controls).toContain('<TuningPicker')
    expect(controls).not.toContain('<ShareButton />')
  })

  it('lets the header wrap rather than stack', () => {
    // The stacking rule the audit found (header column at ≤640px) cost a whole
    // row. With the tuning gone the line fits; wrap is the fallback for a
    // 320pt phone, not the everyday layout.
    expect(appVue).toMatch(/\.room-header\s*\{[^}]*flex-wrap:\s*wrap/)
    // The narrow layer only ever tightens the header now — it does not restack it.
    expect(mediaBlock(layer, '.room-header')).not.toContain('flex-direction')
  })

  it.each([
    { name: 'Share', source: shareButton, button: 'share-button', label: 'Share this board' },
    { name: 'Display', source: displayOptions, button: 'display-button', label: 'Display options' },
  ])('drops $name to its icon on a narrow screen', ({ source, button, label }) => {
    // Two words plus the wordmark are ~54px more than a 402pt header line
    // holds, and a second header row costs more than the words are worth.
    expect(source).toContain(`<span class="button-label">`)
    expect(mediaBlock(source, NARROW)).toContain(`.${button} .button-label`)
    // The name has to survive the word going: without a label the button is an
    // unnamed icon to VoiceOver, which is worse than the row it saved.
    expect(source).toContain(`aria-label="${label}"`)
  })

  it('drops the tuning button to its letters on a narrow screen', () => {
    const tuningLayer = mediaBlock(tuningPicker, NARROW)
    expect(tuningLayer).toContain('.tuning-caption')
    expect(tuningLayer).toContain('.tuning-name')
    expect(tuningLayer).toContain('display: none;')
    // The letters stay, and so does the full name — in the trigger's label.
    expect(tuningPicker).toContain('.tuning-letters')
    expect(tuningPicker).toContain('`Tuning: ${headerLetters} ${headerName}`')
  })
})
