// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseQuery } from '../src/lib/url-state.js'

// The renderer's two tables are read back out of the script, the way
// test/splash-colors.spec.ts reads render-icon.sh: they are bash arrays because
// the siblings are bash and a JSON table would want jq, a fourth global
// dependency. Reading them here is what makes them checkable anyway.
const script = readFileSync(resolve('tools/render-shots.sh'), 'utf8')

const rows = (name: string) =>
  (script.match(new RegExp(`^${name}=\\(\\n([\\s\\S]*?)^\\)$`, 'm'))?.[1] ?? '')
    .split('\n')
    .map(line => line.match(/^\s*"([^"]+)"/)?.[1])
    .filter((row): row is string => Boolean(row))

const slots = rows('SLOTS').map(row => {
  const [slug, points, scale] = row.split('|')
  const [width, height] = String(points).split('x')
  return {
    slug: String(slug),
    width: Number(width),
    height: Number(height),
    scale: Number(scale),
  }
})

const shots = rows('SHOTS').map(row => {
  const [slug, on, query] = row.split('|')
  return { slug: String(slug), slots: String(on).split(' '), query: String(query) }
})

describe('the screenshot slots', () => {
  it('are the three App Store Connect asks for', () => {
    expect(slots.map(s => s.slug)).toEqual(['iphone-6.9', 'iphone-6.5', 'ipad-13'])
  })

  // Points x scale, and the products are Apple's published sizes. A slot whose
  // arithmetic drifted would be rejected at upload, after the whole set had
  // been shot.
  it('are points times the device scale factor', () => {
    const pixels = slots.map(s => `${s.width * s.scale}x${s.height * s.scale}`)
    expect(pixels).toEqual(['1320x2868', '1284x2778', '2064x2752'])
  })

  // The iPad slot is the reason the wide layout is the only iPad shot there
  // can be: 1032pt is over the breakpoint, and Apple offers no narrower iPad.
  it('puts the iPad above the two-column breakpoint', () => {
    const ipad = slots.find(s => s.slug === 'ipad-13')
    expect(ipad?.width).toBeGreaterThanOrEqual(1000)
    expect(slots.filter(s => s.slug.startsWith('iphone')).every(s => s.width < 1000)).toBe(true)
  })
})

describe('the shot table', () => {
  it('names a slot every shot can land in', () => {
    for (const shot of shots) {
      expect(shot.slots.length, shot.slug).toBeGreaterThan(0)
      for (const on of shot.slots) {
        if (on === 'all') continue
        expect(slots.map(s => s.slug), shot.slug).toContain(on)
      }
    }
  })

  // A slot with no shots would ship an empty directory and an unnoticed hole in
  // the listing — which is how the iPad opt-out below could quietly become an
  // opt-out of everything.
  it('leaves no slot empty', () => {
    for (const slot of slots) {
      const covered = shots.filter(s => s.slots.includes('all') || s.slots.includes(slot.slug))
      expect(covered.length, slot.slug).toBeGreaterThan(0)
    }
  })

  // IP-06 in handlebars-docs/plans/ios-ipad-notes.md: the quiz question reads
  // twice in the two-column layout, so the practice shot is phones only.
  it('keeps the quiz off the iPad', () => {
    const practice = shots.find(s => s.slug === 'practice')
    expect(practice?.slots).not.toContain('ipad-13')
    expect(practice?.slots).not.toContain('all')
  })

  // The valuable one. Every param is fed through the room's own parser, so a
  // renamed core id, a `pcard=hidden` typo, or the live trap that parseQuery
  // honours `roles=on` but silently drops `roles=off` all fail here rather
  // than in a picture nobody re-reads.
  it('is queries the room actually honours', () => {
    for (const shot of shots) {
      for (const [key, value] of new URLSearchParams(shot.query)) {
        expect(
          Object.keys(parseQuery(`${key}=${value}`)).length,
          `${shot.slug}: ${key}=${value} is not a room parameter`,
        ).toBeGreaterThan(0)
      }
    }
  })

  // Every card is open by default, so a query that forgets to hide one gets a
  // 2500px page and a shot of whatever happened to be in the first viewport.
  it('says what every card should do', () => {
    const cards = ['staff', 'circle', 'info', 'anatomy', 'pcard']
    for (const shot of shots) {
      const named = [...new URLSearchParams(shot.query).keys()]
      for (const card of cards) expect(named, `${shot.slug}: ${card}`).toContain(card)
    }
  })
})

// Each renderer starts its own dev server, and each one's comment promises the
// others can run at the same time. Four scripts, four ports, or they cannot.
describe('the render scripts', () => {
  it('take a port each', () => {
    const scripts = ['og', 'icon', 'splash', 'shots']
    const ports = scripts.map(name => {
      const source = readFileSync(resolve(`tools/render-${name}.sh`), 'utf8')
      return source.match(/PORT="\$\{PORT:-(\d+)\}"/)?.[1]
    })
    expect(ports.every(Boolean), `no port found in ${ports}`).toBe(true)
    expect(new Set(ports).size).toBe(scripts.length)
  })
})


// The capture job is JSON assembled in bash, and one of the strings going into
// it is a URL carrying whatever query was typed on the command line. The
// function is lifted out of the script and run for real rather than
// pattern-matched, because the bug this guards against is an escape that looks
// right and isn't.
describe('the capture job it hands the camera', () => {
  const escaper = script.match(/^json_string\(\) \{[\s\S]*?^\}$/m)?.[0]

  const jsonString = (value: string) =>
    execFileSync('bash', ['-c', `${escaper}\njson_string "$1"`, 'bash', value], {
      encoding: 'utf8',
    })

  it('is there to lift out', () => {
    expect(escaper).toBeDefined()
  })

  it.each([
    'root=E&chord=maj7',
    'root=A&bogus="quoted"',
    'root=A&bogus=back\\slash',
    'root=A&bogus="\\',
    '/var/folders/tmp.aB3/iphone-6.9-board-dark.png',
  ])('carries %j through JSON unchanged', value => {
    expect(JSON.parse(jsonString(value))).toBe(value)
  })
})
