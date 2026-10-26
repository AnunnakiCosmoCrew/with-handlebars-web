import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INSTRUMENTS, soundfontUrl } from '../src/audio/engine.js'

/**
 * The iOS app is the web build in a WKWebView (ADR-0003), so anything the page
 * pulls off the network is a feature that dies in airplane mode — and the
 * offline claim is load-bearing for the App Store submission (plan §2.4, the
 * Guideline 4.2 mitigation in `ios-app-plan.md`). Verified by hand on the
 * Simulator for HB-38; these are the guards that keep it true.
 *
 * Links are fine — tapping one is a deliberate trip to the network. What must
 * not exist is a *subresource*: a script, stylesheet, font, image or fetch the
 * page needs in order to work.
 */

// happy-dom hands the suite an http `import.meta.url`, so anchor on the
// project root vitest already runs from.
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** Every file under a directory, recursively. */
function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap(name => {
    const rel = `${dir}/${name}`
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]
  })
}

const HTML_ENTRIES = ['404.html', 'index.html', 'about.html', 'privacy.html']
const SOURCES = walk('src')

describe('offline parity — no external subresources', () => {
  it.each(HTML_ENTRIES)('%s loads no scripts or stylesheets off the network', page => {
    const html = read(page)
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/i)
    expect(html).not.toMatch(/<link[^>]+href=["']https?:[^"']*["'][^>]*rel=["']stylesheet/i)
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']https?:/i)
    expect(html).not.toMatch(/<(?:img|source|video|audio|iframe)[^>]+src=["']https?:/i)
  })

  it.each(HTML_ENTRIES)('%s asks for no remote host ahead of time', page => {
    // preconnect / dns-prefetch / preload only make sense for a host we talk to.
    expect(read(page)).not.toMatch(/rel=["'](?:preconnect|dns-prefetch|preload|prefetch)["']/i)
  })

  it('ships no webfonts — the type stack is whatever the device already has', () => {
    for (const file of ['src/style.css', ...HTML_ENTRIES]) {
      expect(read(file)).not.toMatch(/@import|@font-face|fonts\.googleapis|fonts\.gstatic/i)
    }
  })

  it('references no absolute URL from CSS', () => {
    for (const file of [...SOURCES, ...HTML_ENTRIES]) {
      expect(read(file), file).not.toMatch(/url\(\s*["']?https?:/i)
    }
  })

  it('never reaches for the network at runtime', () => {
    for (const file of SOURCES) {
      const src = read(file)
      expect(src, file).not.toMatch(/\bfetch\s*\(/)
      expect(src, file).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon|EventSource|new WebSocket/)
    }
  })
})

describe('offline parity — the samples ship with the app', () => {
  it('builds sample URLs relative to the base, never against a CDN', () => {
    for (const { soundfont } of INSTRUMENTS) {
      const url = soundfontUrl(soundfont)
      // smplr defaults to gleitz.github.io when no instrumentUrl is passed;
      // this is what keeps us off it.
      expect(url).not.toMatch(/^[a-z]+:|^\/\//i)
      expect(url).toContain(`soundfonts/${soundfont}-ogg.js`)
    }
  })

  it('has a bundled sample file for every instrument on the menu', () => {
    const bundled = readdirSync(join(root, 'public/soundfonts'))
    for (const { name, soundfont } of INSTRUMENTS) {
      expect(bundled, `${name} has no sample file`).toContain(`${soundfont}-ogg.js`)
    }
  })
})
