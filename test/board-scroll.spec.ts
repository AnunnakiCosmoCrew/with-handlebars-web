import { describe, expect, it } from 'vitest'
import { applyScrollFraction, scrollFraction } from '../src/lib/board-scroll.js'

// Plain objects rather than a mounted board: happy-dom lays nothing out, so a
// real element's metrics would all be zero and every case below would collapse
// into the one where the board fits.
const scroller = (scrollWidth: number, clientWidth: number, scrollLeft = 0) =>
  ({ scrollWidth, clientWidth, scrollLeft }) as HTMLElement

describe('board scroll fraction', () => {
  it('reads the place along the range', () => {
    expect(scrollFraction(scroller(1000, 400, 300))).toBe(0.5)
  })

  it('reads zero when the whole board fits', () => {
    // The guard that matters: 0/0 is NaN, and NaN written back to scrollLeft
    // sends the board to the nut.
    expect(scrollFraction(scroller(800, 800, 0))).toBe(0)
  })

  it('puts the board back at the same fraction of a new range', () => {
    // Sideways: a wider viewport, so a shorter range — same place on the neck.
    const el = scroller(1200, 800, 999)
    applyScrollFraction(el, 0.5)
    expect(el.scrollLeft).toBe(200)
  })

  it('writes nothing to a board that fits', () => {
    const el = scroller(800, 800, 0)
    applyScrollFraction(el, 0.5)
    expect(el.scrollLeft).toBe(0)
  })

  it('survives a round trip through a rotation', () => {
    const portrait = scroller(1000, 400, 450)
    const landscape = scroller(1200, 800, 0)
    applyScrollFraction(landscape, scrollFraction(portrait))
    expect(landscape.scrollLeft).toBe(300) // three quarters along, both ways
  })
})
