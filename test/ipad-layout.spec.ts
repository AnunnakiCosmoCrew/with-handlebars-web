import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../src/App.vue'
// The iPad layout is CSS, and happy-dom evaluates no scoped stylesheet, so the
// media query and its two declarations are read as text — the same trick
// safe-areas.spec.ts uses. What that catches is the silent half: drop the
// `display: contents` default and the phone quietly gains two wrapper boxes;
// drop the min-width gate and every narrow screen inherits the iPad grid.
import appVue from '../src/App.vue?raw'

const mountApp = () => mount(App, { global: { plugins: [createPinia()] } })

/** The `@media (min-width: 1000px)` block, brace to matching brace. */
const wideBlock = () => {
  const start = appVue.search(/@media \(min-width: 1000px\)/)
  if (start < 0) return ''
  // A query with no brace after it means the block was gutted, not reformatted:
  // scanning from -1 could still slice out a later block and pass by accident.
  const open = appVue.indexOf('{', start)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < appVue.length; i++) {
    if (appVue[i] === '{') depth++
    if (appVue[i] === '}' && --depth === 0) return appVue.slice(start, i + 1)
  }
  return ''
}

describe('iPad layout (HB-51)', () => {
  it('keeps the card wrappers boxless by default', () => {
    // Everything below the breakpoint — every phone, and a Split View pane —
    // must lay out as if the wrappers were never added.
    expect(appVue).toMatch(/\.room-panels,\s*\.panel-col\s*\{\s*display: contents;/)
  })

  it('turns them into two columns only above 1000px', () => {
    const block = wideBlock()
    expect(block).toBeTruthy()
    expect(block).toMatch(/\.room-panels \{[^}]*display: grid;/)
    expect(block).toMatch(/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/)
    expect(block).toMatch(/\.panel-col \{[^}]*display: block;/)
  })

  it('widens the room and caps the board in the same block', () => {
    const block = wideBlock()
    expect(block).toMatch(/\.room \{[^}]*max-width: 1280px;/)
    expect(block).toMatch(/\.board-scroll :deep\(\.fretboard\) \{[^}]*max-width: 1100px;/)
  })

  it('leaves the narrow layout to HB-86: no max-width rule was added', () => {
    // The one promise this change makes to the still-open phone-density issue.
    const added = appVue.match(/@media \(max-width: \d+px\)/g) ?? []
    expect(added).toEqual(['@media (max-width: 640px)'])
  })

  it('renders the six blocks below the board in their single-column order', () => {
    // `display: contents` means source order *is* the phone's rendering order,
    // so a future column reshuffle would silently reorder the phone page.
    const w = mountApp()
    const order = [...w.element.querySelectorAll('.ccard-head, .room-playback')].map(el =>
      el.classList.contains('room-playback') ? 'Playback' : (el.textContent ?? '').trim(),
    )
    expect(order).toEqual([
      'Notation',
      'Playback',
      'Circle of fifths',
      'Practice',
      'Details',
      "How it's built",
    ])
  })

  it('splits those blocks into two columns', () => {
    const w = mountApp()
    const [left, right] = w.findAll('.room-panels > .panel-col')
    expect(left).toBeDefined()
    expect(right).toBeDefined()
    expect(left?.findAll('.ccard')).toHaveLength(1)
    expect(right?.findAll('.ccard')).toHaveLength(3)
    // Notation sits outside the grid: the staff is drawn at a fixed width.
    expect(w.find('.room > .ccard').exists()).toBe(true)
  })
})
