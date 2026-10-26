// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHORD_TYPES, SCALE_TYPES, TUNINGS } from '@anunnakicosmocrew/handlebars'
import { describe, expect, it } from 'vitest'

type Entry = { slug: string; id?: string; root?: string }
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(path), 'utf8')) as T
const inventory = read<{ tunings: Entry[]; chords: Entry[]; scales: Entry[] }>('tools/boards/tier1.json')
const copy = read<{ chords: Record<string, string>; scales: Record<string, string>; tunings: Record<string, string> }>(
  'tools/boards/entity-copy.json',
)

const all = [...Object.entries(copy.chords), ...Object.entries(copy.scales), ...Object.entries(copy.tunings)]

// The generator renders these next to facts the core supplies, so a missing
// paragraph leaves a page as a bare diagram and a stale key renders nothing.
describe('entity copy', () => {
  it('covers every id in the tier-1 inventory', () => {
    for (const t of inventory.tunings) expect(copy.tunings, t.id).toHaveProperty(t.id!)
    for (const c of inventory.chords) expect(copy.chords, c.id).toHaveProperty(c.id!)
    for (const s of inventory.scales) expect(copy.scales, s.id).toHaveProperty(s.id!)
  })

  it('covers every core chord quality and tuning', () => {
    expect(Object.keys(copy.chords).sort()).toEqual(CHORD_TYPES.map(c => c.id).sort())
    expect(Object.keys(copy.tunings).sort()).toEqual(TUNINGS.map(t => t.id).sort())
  })

  it('keys scales by core scale id', () => {
    const known = SCALE_TYPES.map(s => s.id)
    for (const id of Object.keys(copy.scales)) expect(known, id).toContain(id)
  })

  it('quotes each tuning\'s open strings exactly as the core has them', () => {
    for (const t of TUNINGS) expect(copy.tunings[t.id], t.id).toContain(t.letters.join(' '))
  })

  it('has no paragraph duplicated verbatim', () => {
    const texts = all.map(([, text]) => text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('keeps each paragraph to two to four sentences', () => {
    for (const [id, text] of all) {
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
      expect(sentences.length, id).toBeGreaterThanOrEqual(2)
      expect(sentences.length, id).toBeLessThanOrEqual(4)
    }
  })

  it('names no competitor and makes no learning-outcome claim', () => {
    for (const [id, text] of all) {
      expect(text, id).not.toMatch(/chord[\s_-]*house|look,?\s*no\s*hands/i)
      expect(text, id).not.toMatch(/\b(proven|proves|guarantee[sd]?|clinically|scientifically)\b/i)
    }
  })
})
