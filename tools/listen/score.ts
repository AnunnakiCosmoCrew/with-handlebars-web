// Pure half of the Reddit listening digest (HB-162): matching, linking, scoring and
// selection. No I/O and no node imports, so the test suite (which typechecks under
// the browser tsconfig) can import it. The script that reads Reddit is run.ts.

export type Topic = { phrases: string[]; mode: 'chord' | 'scale'; type: string }

export type Config = {
  userAgent: string
  subreddits: Record<string, { weeklyLinkCap: number; rule: string }>
  intentPhrases: string[]
  minThreadAgeMinutes: number
  maxThreadAgeHours: number
  maxComments: number
  digestSize: number
  minScore: number
  topics: Topic[]
}

/** The slice of tier1.json the linker needs. */
export type Inventory = {
  tunings: { slug: string }[]
  roots: { slug: string; root: string }[]
  chords: { slug: string }[]
  scales: { slug: string }[]
}

export type Thread = {
  id: string
  subreddit: string
  title: string
  body: string
  url: string
  createdUtc: number
  numComments: number
}

export type LogEntry = { subreddit: string; at: number; linked?: boolean }
export type State = { surfaced: Record<string, LogEntry>; answered: Record<string, LogEntry> }

export type Candidate = {
  thread: Thread
  score: number
  matched: string[]
  link: string | null
}

export const SITE_ORIGIN = 'https://withhandlebars.com'
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}#♯♭+-]+/gu, ' ').replace(/\s+/g, ' ').trim()

/** Whole-phrase containment on normalised text, so "m7" does not hit "arm7". */
export function hasPhrase(text: string, phrase: string): boolean {
  return ` ${norm(text)} `.includes(` ${norm(phrase)} `)
}

export function matchIntent(thread: Thread, phrases: string[]): string[] {
  const text = `${thread.title} ${thread.body}`
  return phrases.filter(p => hasPhrase(text, p))
}

const NOTE_RE = /(?:^|[^A-Za-z])([A-G])\s?([#b♯♭])?\s+(?:the\s+)?/g

/**
 * The board path that answers a thread, or `null` when the thread does not name a
 * root and a tier-1 type together ("E minor pentatonic"). The note letter is
 * case-sensitive: "a minor" is an article, "A minor" a key. Roots outside the
 * inventory (D#, G#, A#) get no link rather than a guess: a wrong deep link is
 * worse than none. Standard tuning only, the one tuning the inventory has.
 */
export function linkFor(thread: Thread, topics: Topic[], inv: Inventory): string | null {
  const text = `${thread.title} ${thread.body}`
  const tuning = inv.tunings[0]?.slug
  if (!tuning) return null
  for (const m of text.matchAll(NOTE_RE)) {
    const accidental = (m[2] ?? '').replace('♯', '#').replace('♭', 'b')
    const root = inv.roots.find(r => r.root === `${m[1]}${accidental}`)
    if (!root) continue
    const rest = text.slice(m.index + m[0].length).toLowerCase()
    for (const topic of topics) {
      const known = (topic.mode === 'chord' ? inv.chords : inv.scales).some(s => s.slug === topic.type)
      const hit = topic.phrases.some(p => rest.startsWith(p) && !/[a-z0-9-]/.test(rest.charAt(p.length)))
      if (known && hit) return `/${tuning}/${root.slug}/${topic.mode}/${topic.type}/`
    }
  }
  return null
}

export function score(thread: Thread, matched: string[], cfg: Config, now: number): number {
  const ageMin = (now - thread.createdUtc * 1000) / 60_000
  if (ageMin < cfg.minThreadAgeMinutes) return 0
  if (ageMin > cfg.maxThreadAgeHours * 60) return 0
  if (thread.numComments > cfg.maxComments) return 0
  if (matched.length === 0) return 0
  const intent = Math.min(matched.length, 3)
  const fresh = 1 - ageMin / (cfg.maxThreadAgeHours * 60)
  const open = 1 - thread.numComments / (cfg.maxComments + 1)
  return Math.round((intent + fresh + open) * 100) / 100
}

/** A subreddit's config, matched case-insensitively as Reddit's casing can differ. */
export function subConfig(cfg: Config, name: string) {
  return cfg.subreddits[name] ?? Object.entries(cfg.subreddits).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
}

export function mentionsSite(text: string): boolean {
  return /withhandlebars\.com/i.test(text)
}

/** Subreddits that already had a linked reply in the last seven days. */
export function recentlyLinked(state: State, now: number): Set<string> {
  return new Set(
    Object.values(state.answered)
      .filter(e => e.linked !== false && now - e.at < WEEK_MS)
      .map(e => e.subreddit.toLowerCase()),
  )
}

/**
 * Candidates for the digest, best first. Drops threads already surfaced, threads
 * that already link to the site, and subreddits inside their weekly link window;
 * then caps each subreddit at its `weeklyLinkCap` so one community is never
 * offered two linked replies in a digest.
 */
export function pick(
  threads: Thread[],
  cfg: Config,
  inv: Inventory,
  state: State,
  now: number,
  hasSiteLink: (t: Thread) => boolean = t => mentionsSite(`${t.title} ${t.body} ${t.url}`),
): Candidate[] {
  const blocked = recentlyLinked(state, now)
  const ranked: Candidate[] = []
  for (const thread of threads) {
    if (!subConfig(cfg, thread.subreddit)) continue
    if (state.surfaced[thread.id] || state.answered[thread.id]) continue
    if (blocked.has(thread.subreddit.toLowerCase())) continue
    if (hasSiteLink(thread)) continue
    const matched = matchIntent(thread, cfg.intentPhrases)
    const link = linkFor(thread, cfg.topics, inv)
    const s = score(thread, matched, cfg, now) + (link ? 1 : 0)
    if (s < cfg.minScore || score(thread, matched, cfg, now) === 0) continue
    ranked.push({ thread, score: s, matched, link })
  }
  ranked.sort((a, b) => b.score - a.score || a.thread.id.localeCompare(b.thread.id))
  const perSub = new Map<string, number>()
  const out: Candidate[] = []
  for (const c of ranked) {
    // Only a thread with a deep link would get a linked reply, so only those count.
    if (c.link) {
      const key = c.thread.subreddit.toLowerCase()
      if ((perSub.get(key) ?? 0) >= (subConfig(cfg, c.thread.subreddit)?.weeklyLinkCap ?? 1)) continue
      perSub.set(key, (perSub.get(key) ?? 0) + 1)
    }
    out.push(c)
    if (out.length >= cfg.digestSize) break
  }
  return out
}

const ago = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`
}

export function renderDigest(cands: Candidate[], cfg: Config, now: number): string {
  const day = new Date(now).toISOString().slice(0, 10)
  const lines = [`# Reddit listening digest — ${day}`, '']
  if (cands.length === 0) lines.push('No thread today where a Handlebars board is the honest answer.', '')
  cands.forEach((c, i) => {
    const t = c.thread
    const rule = subConfig(cfg, t.subreddit)?.rule ?? ''
    lines.push(
      `## ${i + 1}. r/${t.subreddit} — ${t.title.replace(/\s+/g, ' ').trim()}`,
      '',
      `- Thread: ${t.url}`,
      `- Age: ${ago(now - t.createdUtc * 1000)} · Comments: ${t.numComments} · Matched: ${c.matched.join(', ')}`,
      c.link ? `- Deep link: ${SITE_ORIGIN}${c.link}` : '- Deep link: none — no board answers this one; reply in words, no link',
      `- Rule: ${rule}`,
      `- Once answered: \`npm run listen -- --answered ${t.id}\` (add \`--no-link\` if you did not link)`,
      '',
    )
  })
  lines.push('You write every reply yourself. This script never posts, votes or messages.', '')
  return lines.join('\n')
}
