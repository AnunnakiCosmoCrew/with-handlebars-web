/**
 * Pure layout math for the StaffView SVG — the notation sibling of
 * fretboard-geometry.ts. Positions are diatonic indices: each letter step is
 * one index (C0 = 0, D0 = 1 … B0 = 6, C1 = 7 …), so an index maps to a line
 * or space on the staff. The bottom staff line (written E4) is index 30.
 */

const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }

/** Diatonic index of a spelled pitch (letter + octave, accidental-blind). */
export function diatonicIndex(letter: string, octave: number): number {
  const l = LETTER_INDEX[letter]
  if (l === undefined) throw new Error(`bad letter: ${letter}`)
  return octave * 7 + l
}

/**
 * Guitar is written an octave above sounding, letter and accidental
 * unchanged — so the written index is the sounding one plus one octave.
 */
export function writtenIndex(letter: string, soundingOctave: number): number {
  return diatonicIndex(letter, soundingOctave + 1)
}

/** The five staff lines, bottom to top: written E4 G4 B4 D5 F5. */
export const LINE_INDICES = [30, 32, 34, 36, 38] as const

/**
 * Ledger lines a note at `idx` needs: every line position between the staff
 * and the note, inclusive. A note in the space just beyond a ledger line
 * still needs that line, but nothing further.
 */
export function ledgerLines(idx: number): number[] {
  const out: number[] = []
  for (let p = 28; p >= idx; p -= 2) out.push(p)
  for (let p = 40; p <= idx; p += 2) out.push(p)
  return out
}

/**
 * Placing the treble clef glyph. A clef has to line up with the staff by its
 * ink, not by its em box — a plain font-size and baseline drop it wherever
 * the font's metrics happen to fall, which is neither the right size nor the
 * right height. Measured on the fallback 𝄞 (the same glyph whichever family
 * supplies it), the ink stands 0.733em tall and reaches 0.656em above the
 * baseline; engraved treble clefs run about seven staff spaces tall with the
 * spiral's centre — the G the clef names — 9/16 of the way down that ink.
 */
const CLEF_INK = 0.733
const CLEF_ASCENT = 0.656
const CLEF_G = 0.5625
const CLEF_SPACES = 7

/** Font size that makes the clef seven spaces tall on a staff of `space` px. */
export function clefSize(space: number): number {
  return Math.round((CLEF_SPACES * space) / CLEF_INK)
}

/** Where to put its baseline, as an offset below the G line. */
export function clefBaseline(size: number): number {
  return (CLEF_ASCENT - CLEF_G * CLEF_INK) * size
}

/** How far its tail hangs below the G line. */
export function clefTail(size: number): number {
  return (1 - CLEF_G) * CLEF_INK * size
}

/** ASCII accidental suffix → notation glyph. */
export function accidentalGlyph(accidental: string): string {
  const glyphs: Record<string, string> = { '': '', '#': '♯', '##': '𝄪', b: '♭', bb: '𝄫' }
  const g = glyphs[accidental]
  if (g === undefined) throw new Error(`bad accidental: ${accidental}`)
  return g
}
