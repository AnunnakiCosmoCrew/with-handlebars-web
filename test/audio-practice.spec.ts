import { describe, expect, it } from 'vitest'
import {
  METERS,
  TEMPO_DEFAULT,
  TEMPO_MAX,
  TEMPO_MIN,
  beatSeconds,
  bpmFromTaps,
  clampTempo,
  meterOf,
  midiFrequency,
} from '../src/audio/practice.js'

describe('tempo math', () => {
  it('clamps tempos into the supported range', () => {
    expect(clampTempo(100)).toBe(100)
    expect(clampTempo(10)).toBe(TEMPO_MIN)
    expect(clampTempo(999)).toBe(TEMPO_MAX)
    expect(clampTempo(120.6)).toBe(121)
    expect(clampTempo(Number.NaN)).toBe(TEMPO_DEFAULT)
  })

  it('turns BPM into seconds per beat', () => {
    expect(beatSeconds(60)).toBe(1)
    expect(beatSeconds(120)).toBe(0.5)
    expect(beatSeconds(TEMPO_DEFAULT)).toBeCloseTo(0.6)
  })
})

describe('midiFrequency', () => {
  it('places A4 at 440 and octaves at powers of two', () => {
    expect(midiFrequency(69)).toBe(440)
    expect(midiFrequency(57)).toBeCloseTo(220)
    expect(midiFrequency(81)).toBeCloseTo(880)
    expect(midiFrequency(60)).toBeCloseTo(261.63, 1)
  })
})

describe('meters', () => {
  it('accents the downbeat, plus the second pulse head in 6/8', () => {
    expect(METERS.map(m => m.id)).toEqual(['2/4', '3/4', '4/4', '6/8'])
    expect(meterOf('3/4')).toMatchObject({ beats: 3, accents: [0] })
    expect(meterOf('6/8')).toMatchObject({ beats: 6, accents: [0, 3] })
  })
})

describe('bpmFromTaps', () => {
  it('averages the gaps between recent taps', () => {
    expect(bpmFromTaps([0, 500, 1000])).toBe(120)
    expect(bpmFromTaps([0, 400, 800, 1200])).toBe(150)
    // a slightly uneven human streak still lands near the mean
    expect(bpmFromTaps([0, 480, 990, 1500])).toBe(120)
  })

  it('needs at least two taps and plausible gaps', () => {
    expect(bpmFromTaps([])).toBe(null)
    expect(bpmFromTaps([1000])).toBe(null)
    expect(bpmFromTaps([0, 5000])).toBe(null) // longer than a tap streak allows
    expect(bpmFromTaps([100, 100])).toBe(null) // zero gap
  })

  it('clamps the result into the supported range', () => {
    expect(bpmFromTaps([0, 100, 200])).toBe(TEMPO_MAX)
    expect(bpmFromTaps([0, 1900, 3800])).toBe(TEMPO_MIN)
  })
})
