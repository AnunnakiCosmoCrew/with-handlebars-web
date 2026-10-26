/**
 * Keep the place on the neck across a relayout.
 *
 * Rotating a phone re-measures the board's scroller: the range it can scroll
 * through changes, and the raw offset the user was at no longer means the same
 * fret. Someone studying the 12th fret in portrait lands back at the nut in
 * landscape — the money view, arriving at the wrong end of the neck.
 *
 * A fraction of the scrollable range survives that, so these two functions are
 * the whole idea: read one before the layout changes, write it back after.
 * They are separate from App.vue because the arithmetic is where the bug would
 * live (a board that fits its container has a range of zero, and 0/0 is NaN),
 * and arithmetic can be tested without laying out a page a test runner does
 * not lay out anyway.
 */

const rangeOf = (el: HTMLElement) => el.scrollWidth - el.clientWidth

/** Where along the scrollable range the element sits, 0–1. */
export function scrollFraction(el: HTMLElement): number {
  const range = rangeOf(el)
  // A board that fits has no range and no position to remember.
  return range > 0 ? el.scrollLeft / range : 0
}

/** Put the element back at that fraction of its (possibly new) range. */
export function applyScrollFraction(el: HTMLElement, fraction: number): void {
  const range = rangeOf(el)
  if (range > 0) el.scrollLeft = fraction * range
}
