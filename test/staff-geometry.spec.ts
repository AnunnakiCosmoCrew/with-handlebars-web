import { describe, expect, it } from 'vitest'
import {
  LINE_INDICES,
  accidentalGlyph,
  diatonicIndex,
  ledgerLines,
  writtenIndex,
} from '../src/components/staff-geometry.js'

describe('staff geometry', () => {
  it('indexes diatonic steps with the bottom staff line at 30', () => {
    expect(diatonicIndex('C', 0)).toBe(0)
    expect(diatonicIndex('E', 4)).toBe(30) // written E4 = bottom line
    expect(diatonicIndex('F', 5)).toBe(38) // written F5 = top line
    expect(LINE_INDICES).toEqual([30, 32, 34, 36, 38])
    expect(() => diatonicIndex('H', 4)).toThrow()
  })

  it('writes guitar an octave above sounding', () => {
    expect(writtenIndex('E', 3)).toBe(diatonicIndex('E', 4))
    expect(writtenIndex('B', 3)).toBe(diatonicIndex('B', 4))
  })

  it('gives notes on and between the staff lines no ledger lines', () => {
    for (let idx = 29; idx <= 39; idx++) expect(ledgerLines(idx)).toEqual([])
  })

  it('adds ledger lines up to and including the note position', () => {
    expect(ledgerLines(28)).toEqual([28]) // written middle C
    expect(ledgerLines(27)).toEqual([28]) // space below the C ledger — same single line
    expect(ledgerLines(24)).toEqual([28, 26, 24])
    expect(ledgerLines(23)).toEqual([28, 26, 24]) // written E3, low open E sounding
    expect(ledgerLines(40)).toEqual([40])
    expect(ledgerLines(44)).toEqual([40, 42, 44])
  })

  it('maps accidentals to notation glyphs', () => {
    expect(accidentalGlyph('')).toBe('')
    expect(accidentalGlyph('#')).toBe('♯')
    expect(accidentalGlyph('b')).toBe('♭')
    expect(accidentalGlyph('##')).toBe('𝄪')
    expect(accidentalGlyph('bb')).toBe('𝄫')
    expect(() => accidentalGlyph('x')).toThrow()
  })
})
