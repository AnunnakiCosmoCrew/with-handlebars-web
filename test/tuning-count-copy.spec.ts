// @vitest-environment node
import { TUNINGS } from '@anunnakicosmocrew/handlebars'
import { describe, expect, it } from 'vitest'
import aboutHtml from '../about.html?raw'
import indexHtml from '../index.html?raw'
import ogCard from '../src/og/OgCard.vue?raw'
import readme from '../README.md?raw'

// The public copy states the number of tunings by hand; the core is where it
// comes from. A preset added there fails here until the copy catches up.
const pages = { 'index.html': indexHtml, 'about.html': aboutHtml, 'OgCard.vue': ogCard, 'README.md': readme }

describe('tuning count in public copy', () => {
  for (const [name, text] of Object.entries(pages)) {
    it(`${name} states the core's tuning count`, () => {
      const stated = [...text.matchAll(/\b(\d+)\+?\s+tunings\b/g)].map(m => Number(m[1]))
      expect(stated.length).toBeGreaterThan(0)
      for (const n of stated) expect(n).toBe(TUNINGS.length)
    })
  }

  it('names bass and ukulele where the instrument is named', () => {
    for (const text of [indexHtml, aboutHtml]) expect(text).toMatch(/bass/)
    for (const text of [indexHtml, aboutHtml]) expect(text).toMatch(/ukulele/)
  })
})
