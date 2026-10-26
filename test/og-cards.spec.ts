// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BOARDS, boardFromPath, boardPath } from '../src/lib/board-path'
import { cardFile } from '../tools/board-pages-plugin'
import { cardJobs, missingImages } from '../tools/og-cards-plugin'

/**
 * HB-155. The renderer's pure half: which cards a build owes, the key each is
 * cached under, and the check that fails a build whose pages point at an image
 * `dist` does not have. The photographing itself needs a browser and runs in
 * CI's card build, which ends with that same check.
 */

describe('cardJobs', () => {
  const jobs = cardJobs('inputs-a')

  it('owes an Open Graph and a 16:9 card for every board, beside its page', () => {
    expect(jobs).toHaveLength(BOARDS.length * 2)
    for (const b of BOARDS) {
      expect(jobs.filter(j => j.board === b).map(j => j.file)).toEqual([cardFile(b, 'og'), cardFile(b, 'wide')])
    }
    expect(cardFile(BOARDS[0]!, 'wide')).toBe(`${boardPath(BOARDS[0]!)!.slice(1)}og-wide.png`)
  })

  it('asks og.html for the board by its path, so the card shows what the page does', () => {
    for (const job of jobs) {
      const q = new URLSearchParams(job.query)
      expect(boardFromPath(q.get('board')!)).toEqual(job.board)
      expect(q.get('size')).toBe(job.size === 'wide' ? 'wide' : null)
    }
  })

  it('keys each card by the render inputs and its own board and size', () => {
    expect(new Set(jobs.map(j => j.key)).size).toBe(jobs.length)
    expect(cardJobs('inputs-a').map(j => j.key)).toEqual(jobs.map(j => j.key))
    // Anything that draws the card changing re-renders every card…
    const changed = cardJobs('inputs-b')
    expect(changed.every((j, i) => j.key !== jobs[i]!.key)).toBe(true)
    // …while a board added to the inventory leaves the others' keys alone.
    expect(cardJobs('inputs-a', BOARDS.slice(0, 3)).map(j => j.key)).toEqual(jobs.slice(0, 6).map(j => j.key))
  })
})

describe('missingImages', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const page = (image: string) =>
    `<meta property="og:image" content="${image}" />\n<meta name="twitter:image" content="${image}" />`

  it('passes when every page\'s image is a file in dist, and names each one that is not', () => {
    dir = mkdtempSync(join(tmpdir(), 'og-cards-'))
    mkdirSync(join(dir, 'standard/a/chord/minor-7'), { recursive: true })
    writeFileSync(join(dir, 'og.png'), '')
    writeFileSync(join(dir, 'index.html'), page('https://withhandlebars.com/og.png'))
    writeFileSync(
      join(dir, 'standard/a/chord/minor-7/index.html'),
      page('https://withhandlebars.com/standard/a/chord/minor-7/og.png'),
    )
    expect(missingImages(dir)).toEqual([
      'standard/a/chord/minor-7/index.html → https://withhandlebars.com/standard/a/chord/minor-7/og.png',
      'standard/a/chord/minor-7/index.html → https://withhandlebars.com/standard/a/chord/minor-7/og.png',
    ])
    writeFileSync(join(dir, 'standard/a/chord/minor-7/og.png'), '')
    expect(missingImages(dir)).toEqual([])
  })

  it('counts an image off the site as missing: the card has to ship with the page', () => {
    dir = mkdtempSync(join(tmpdir(), 'og-cards-'))
    writeFileSync(join(dir, 'index.html'), page('https://example.com/og.png'))
    expect(missingImages(dir)).toHaveLength(2)
  })
})
