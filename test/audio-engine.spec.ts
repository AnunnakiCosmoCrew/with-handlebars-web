import { describe, expect, it } from 'vitest'
import { INSTRUMENTS, SPEED_DEFAULT, noteSchedule } from '../src/audio/engine.js'

describe('instruments', () => {
  it('offers the four observed guitars', () => {
    expect(INSTRUMENTS.map(i => i.name)).toEqual([
      'Nylon Guitar',
      'Steel Guitar',
      'Electric Guitar (Clean)',
      'Electric Guitar (Jazz)',
    ])
  })
})

describe('noteSchedule', () => {
  const strum = { midi: [52, 56, 59], kind: 'strum' as const }
  const run = { midi: [52, 54, 56], kind: 'sequence' as const }

  it('staggers strums and sustains every note', () => {
    const s = noteSchedule(strum, SPEED_DEFAULT)
    expect(s.map(n => n.note)).toEqual([52, 56, 59])
    expect(s[0]!.at).toBe(0)
    expect(s[1]!.at).toBeGreaterThan(0)
    expect(s[2]!.at).toBeCloseTo(s[1]!.at * 2)
    expect(new Set(s.map(n => n.duration)).size).toBe(1)
  })

  it('spaces sequences evenly with near-step durations', () => {
    const s = noteSchedule(run, SPEED_DEFAULT)
    const step = s[1]!.at
    expect(s.map(n => n.at)).toEqual([0, step, step * 2])
    expect(s[0]!.duration).toBeLessThan(step)
  })

  it('is faster at higher speed steps, for both kinds', () => {
    for (const p of [strum, run]) {
      const slow = noteSchedule(p, 0)
      const fast = noteSchedule(p, 4)
      expect(fast[1]!.at).toBeLessThan(slow[1]!.at)
    }
  })

  it('clamps out-of-range speeds instead of crashing', () => {
    expect(noteSchedule(run, -3)).toEqual(noteSchedule(run, 0))
    expect(noteSchedule(run, 99)).toEqual(noteSchedule(run, 4))
  })
})
