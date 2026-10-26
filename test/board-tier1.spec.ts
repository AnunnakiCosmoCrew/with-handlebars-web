// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHORD_TYPES, ROOTS, SCALE_TYPES, TUNINGS } from '@anunnakicosmocrew/handlebars'
import { describe, expect, it } from 'vitest'

type Entry = { slug: string; id?: string; root?: string }
const inventory = JSON.parse(readFileSync(resolve('tools/boards/tier1.json'), 'utf8')) as {
  tunings: Entry[]
  roots: Entry[]
  chords: Entry[]
  scales: Entry[]
}

// The inventory is the one list the generator, the sitemap and the client's path
// reflection read, so a slug that stops resolving to a core id would 404 a
// published page or reflect a path nothing serves.
describe('tier-1 board inventory', () => {
  const resolves = (entries: Entry[], key: 'id' | 'root', known: string[]) => {
    for (const e of entries) expect(known, `${e.slug} -> ${e[key]}`).toContain(e[key])
  }

  it('maps every entry to a valid core id', () => {
    resolves(inventory.tunings, 'id', TUNINGS.map(t => t.id))
    resolves(inventory.roots, 'root', ROOTS.map(r => r.root))
    resolves(inventory.chords, 'id', CHORD_TYPES.map(c => c.id))
    resolves(inventory.scales, 'id', SCALE_TYPES.map(s => s.id))
  })

  it('has one-to-one slugs that are safe in a path', () => {
    for (const list of [inventory.tunings, inventory.roots, inventory.chords, inventory.scales]) {
      const slugs = list.map(e => e.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
      for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      const ids = list.map(e => e.id ?? e.root)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('is the decided subset: standard tuning, 12 roots, 24 chords, 12 scales', () => {
    expect(inventory.tunings.map(t => t.id)).toEqual(['standard'])
    expect(inventory.roots).toHaveLength(12)
    expect(inventory.chords).toHaveLength(24)
    expect(inventory.scales).toHaveLength(12)
    const { tunings, roots, chords, scales } = inventory
    expect(tunings.length * roots.length * (chords.length + scales.length)).toBe(432)
  })

  it('keeps enharmonic twins out: one spelling per pitch', () => {
    const twins = new Map(ROOTS.map(r => [r.root, r.enharmonic]))
    const used = inventory.roots.map(r => r.root!)
    for (const r of used) expect(used).not.toContain(twins.get(r))
  })
})
