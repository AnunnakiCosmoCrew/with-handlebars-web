import { describe, expect, it } from 'vitest'
import { boardFromPath, boardPath } from '../src/lib/board-path'
import inventory from '../tools/boards/tier1.json'
import config from '../tools/listen/config.json'
import { hasPhrase, linkFor, pick, recentlyLinked, renderDigest, WEEK_MS } from '../tools/listen/score'
import type { Config, State, Thread } from '../tools/listen/score'

const cfg = config as Config
const now = Date.UTC(2026, 9, 25, 12)
const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 'a1',
  subreddit: 'guitarlessons',
  title: 'Which notes are in the E minor pentatonic?',
  body: '',
  url: 'https://www.reddit.com/r/guitarlessons/comments/a1/x/',
  createdUtc: now / 1000 - 3 * 3600,
  numComments: 1,
  ...over,
})
const empty = (): State => ({ surfaced: {}, answered: {} })

describe('listening digest', () => {
  it('matches whole phrases only', () => {
    expect(hasPhrase('my arm7 hurts', 'm7')).toBe(false)
    expect(hasPhrase('Drop D, anyone?', 'drop d')).toBe(true)
  })

  it('links to a path the generator publishes', () => {
    const link = linkFor(thread(), cfg.topics, inventory)
    expect(link).toBe('/standard/e/scale/pentatonic-minor/')
    expect(boardPath(boardFromPath(link!)!)).toBe(link)
  })

  it('every configured topic names a real tier-1 type', () => {
    for (const t of cfg.topics) {
      const slugs = (t.mode === 'chord' ? inventory.chords : inventory.scales).map(s => s.slug)
      expect(slugs).toContain(t.type)
    }
  })

  it('gives no link without a root, with an article, or off-inventory', () => {
    const t = (title: string) => linkFor(thread({ title }), cfg.topics, inventory)
    expect(t('what is the minor pentatonic')).toBeNull()
    expect(t('play a minor pentatonic over this')).toBeNull()
    expect(t('A minor blues scale')).toBeNull()
    expect(t('E minor7 voicings')).toBeNull()
    expect(t('A minor key help')).toBeNull()
    expect(t('E minor scale?')).toBe('/standard/e/scale/aeolian/')
    expect(t('G# minor pentatonic?')).toBeNull()
    expect(t('F# dorian shapes')).toBe('/standard/f-sharp/scale/dorian/')
  })

  it('surfaces a fresh, unanswered thread and renders the deep link', () => {
    const got = pick([thread()], cfg, inventory, empty(), now)
    expect(got).toHaveLength(1)
    expect(renderDigest(got, cfg, now)).toContain('https://withhandlebars.com/standard/e/scale/pentatonic-minor/')
  })

  it('drops old, crowded, too-new, off-intent, linked and already-surfaced threads', () => {
    const bad = [
      thread({ id: 'b1', createdUtc: now / 1000 - 100 * 3600 }),
      thread({ id: 'b2', numComments: 40 }),
      thread({ id: 'b3', createdUtc: now / 1000 - 60 }),
      thread({ id: 'b4', title: 'Best strings for my guitar?' }),
      thread({ id: 'b5', body: 'see https://withhandlebars.com/' }),
      thread({ id: 'b6', subreddit: 'Guitar' }),
      thread({ id: 'b7' }),
    ]
    const state = empty()
    state.surfaced['b7'] = { subreddit: 'guitarlessons', at: now }
    expect(pick(bad, cfg, inventory, state, now)).toEqual([])
  })

  it('lets a linkless thread keep its subreddit slot and finds the rule by any casing', () => {
    const t = (id: string, title: string) => thread({ id, title, subreddit: 'GuitarLessons' })
    const mixed = [t('d1', 'Which notes should I learn?'), t('d2', 'Which notes in E minor pentatonic')]
    const got = pick(mixed, cfg, inventory, empty(), now)
    expect(got.map(c => c.thread.id).sort()).toEqual(['d1', 'd2'])
    expect(renderDigest(got, cfg, now)).toContain('removes promotion')
  })

  it('offers a subreddit once per digest and not within a week of a linked reply', () => {
    const two = [thread({ id: 'c1' }), thread({ id: 'c2', title: 'Which notes in A minor pentatonic' })]
    expect(pick(two, cfg, inventory, empty(), now)).toHaveLength(1)

    const state = empty()
    state.answered['z'] = { subreddit: 'guitarlessons', at: now - 2 * 24 * 3600 * 1000, linked: true }
    expect(pick(two, cfg, inventory, state, now)).toEqual([])
    state.answered['z']!.at = now - WEEK_MS - 1
    expect(pick(two, cfg, inventory, state, now)).toHaveLength(1)
    state.answered['z'] = { subreddit: 'guitarlessons', at: now, linked: false }
    expect(recentlyLinked(state, now).size).toBe(0)
  })
})
