// @vitest-environment node
import { readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import config from '../vite.config'

// og.html, icon.html, splash.html and shots.html are dev-only render sources,
// kept out of the build inputs so they never reach dist/. Nothing but this
// guarded that, and adding a page is exactly the moment someone would paste the
// wrong path in.
describe('build inputs', () => {
  const input = config.build?.rollupOptions?.input as Record<string, string>

  // Named rather than pattern-matched: a further page has to be added to one of
  // these two lists before the suite will pass, which is the point. The old
  // version of this test asked only that no input *looked* like a render page,
  // and a page named anything else would have walked straight past it.
  const shipped = ['404.html', 'about.html', 'index.html', 'privacy.html']
  const devOnly = ['icon.html', 'og.html', 'shots.html', 'splash.html']

  it('is one entry per page that ships', () => {
    expect(Object.keys(input).sort()).toEqual(['about', 'main', 'notFound', 'privacy'])
  })

  it('accounts for every page in the repo', () => {
    const pages = readdirSync(resolve('.')).filter(f => f.endsWith('.html'))
    expect(pages.sort()).toEqual([...shipped, ...devOnly].sort())
  })

  it('leaves the dev-only render pages out', () => {
    for (const path of Object.values(input)) {
      expect(devOnly).not.toContain(basename(path))
    }
  })
})
