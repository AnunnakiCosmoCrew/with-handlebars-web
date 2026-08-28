/**
 * Pure layout math for the Fretboard SVG. Handedness and string order are
 * coordinate transforms over one layout — never separate render paths.
 */

export type Handedness = 'right' | 'left'
export type StringOrder = 'bass-bottom' | 'bass-top'

export const GEOM = {
  tunerWidth: 58,
  openWidth: 34,
  nutWidth: 7,
  fretWidth: 54,
  stringGap: 26,
  topPad: 26,
  bottomPad: 26,
} as const

export function boardWidth(fretCount: number): number {
  return GEOM.tunerWidth + GEOM.openWidth + GEOM.nutWidth + fretCount * GEOM.fretWidth + 8
}

export function boardHeight(stringCount: number): number {
  return GEOM.topPad + stringCount * GEOM.stringGap + GEOM.bottomPad
}

/** Mirror an x coordinate for left-handed display. */
export function mirrorX(x: number, handedness: Handedness, width: number): number {
  return handedness === 'right' ? x : width - x
}

/**
 * Vertical center of a string. `index` indexes tuning.strings (0 = lowest
 * pitch); bass-bottom puts it in the bottom row.
 */
export function stringY(index: number, stringCount: number, order: StringOrder): number {
  const row = order === 'bass-bottom' ? stringCount - 1 - index : index
  return GEOM.topPad + row * GEOM.stringGap + GEOM.stringGap / 2
}

/** X of the nut's left edge in natural (right-handed) coordinates. */
export function nutX(): number {
  return GEOM.tunerWidth + GEOM.openWidth
}

/** X of the wire for a given fret (1..fretCount) in natural coordinates. */
export function fretWireX(fret: number): number {
  return nutX() + GEOM.nutWidth + fret * GEOM.fretWidth
}

/**
 * Center x for a dot: fret 0 sits in the open column left of the nut, any
 * other fret sits mid-cell.
 */
export function dotX(fret: number, handedness: Handedness, width: number): number {
  const natural =
    fret === 0
      ? GEOM.tunerWidth + GEOM.openWidth / 2
      : fretWireX(fret) - GEOM.fretWidth / 2
  return mirrorX(natural, handedness, width)
}

/**
 * Natural (right-handed) x-span of a box window: from the left edge of the
 * minFret cell (the open column when minFret is 0) to the maxFret wire.
 */
export function boxSpanX(minFret: number, maxFret: number): { x1: number; x2: number } {
  // A fret cell's left edge is its own wire minus the cell width, keeping
  // fretWireX calls within its 1..fretCount contract.
  const x1 = minFret === 0 ? GEOM.tunerWidth : fretWireX(minFret) - GEOM.fretWidth
  return { x1, x2: fretWireX(maxFret) }
}

/** Frets that get a number above the board. */
export function numberedFrets(fretCount: number): number[] {
  return [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].filter(f => f <= fretCount)
}

/** Frets that get a position marker below the board; 12 and 24 get a double dot. */
export function markerFrets(fretCount: number): { fret: number; double: boolean }[] {
  return numberedFrets(fretCount).map(f => ({ fret: f, double: f % 12 === 0 }))
}
