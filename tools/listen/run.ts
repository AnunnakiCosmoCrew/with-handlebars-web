// Reddit listening digest (HB-162). Read-only: application-only OAuth against the
// official Data API, GET requests only. It never posts, votes or messages.
//   npm run listen                       build today's digest
//   npm run listen -- --answered <id>    mark a surfaced thread answered (linked)
//   npm run listen -- --answered <id> --no-link
// Credentials live in tools/listen/credentials.json (untracked): {"clientId","clientSecret"}.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mentionsSite, pick, renderDigest } from './score.ts'
import type { Config, Inventory, State, Thread } from './score.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = <T>(path: string, fallback?: T): T => {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

const statePath = join(here, 'state.json')
const state = read<State>(statePath, { surfaced: {}, answered: {} })
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
const args = process.argv.slice(2)
const now = Date.now()

const answeredAt = args.indexOf('--answered')
if (answeredAt >= 0) {
  const id = (args[answeredAt + 1] ?? '').replace(/^.*\/comments\/([a-z0-9]+).*$/, '$1')
  const seen = state.surfaced[id]
  if (!seen) {
    console.error(`Thread ${id || '(none)'} was never surfaced; nothing to mark.`)
    process.exit(1)
  }
  state.answered[id] = { subreddit: seen.subreddit, at: now, linked: !args.includes('--no-link') }
  save()
  console.log(`Marked ${id} answered in r/${seen.subreddit}.`)
  process.exit(0)
}

const cfg = read<Config>(join(here, 'config.json'))
const inv = read<Inventory>(join(here, '..', 'boards', 'tier1.json'))
const creds = read<{ clientId: string; clientSecret: string }>(join(here, 'credentials.json'))

const headers = { 'User-Agent': cfg.userAgent }
const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
  method: 'POST',
  headers: {
    ...headers,
    Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
})
if (!tokenRes.ok) throw new Error(`Reddit token request failed: ${tokenRes.status}`)
const { access_token: token } = (await tokenRes.json()) as { access_token: string }

// One GET per call, spaced out: a handful of calls a day, far below the free limit.
const get = async (path: string) => {
  const res = await fetch(`https://oauth.reddit.com${path}`, { headers: { ...headers, Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Reddit ${path} failed: ${res.status}`)
  await new Promise(r => setTimeout(r, 1100))
  return res.json() as Promise<any>
}

const threads: Thread[] = []
for (const sub of Object.keys(cfg.subreddits)) {
  const listing = await get(`/r/${sub}/new?limit=50&raw_json=1`)
  for (const { data: d } of listing.data.children) {
    threads.push({
      id: d.id,
      subreddit: d.subreddit,
      title: d.title,
      body: d.selftext ?? '',
      url: `https://www.reddit.com${d.permalink}`,
      createdUtc: d.created_utc,
      numComments: d.num_comments,
    })
  }
}

// Comments are fetched only for threads that would otherwise make the digest, so the
// "already links to the site" check costs a few calls, not one per thread.
const commented = new Map<string, boolean>()
const linked = (t: Thread) => mentionsSite(`${t.title} ${t.body} ${t.url}`) || (commented.get(t.id) ?? false)
let final = pick(threads, cfg, inv, state, now, linked)
// Dropping a linked thread promotes the next one in its subreddit, which has not
// been checked yet: repeat until every pick has had its comments read.
for (;;) {
  const unchecked = final.filter(c => !commented.has(c.thread.id))
  if (unchecked.length === 0) break
  for (const c of unchecked) {
    const tree = await get(`/comments/${c.thread.id}?limit=100&raw_json=1`)
    commented.set(c.thread.id, mentionsSite(JSON.stringify(tree[1] ?? '')))
  }
  final = pick(threads, cfg, inv, state, now, linked)
}

const dir = join(here, 'digests')
mkdirSync(dir, { recursive: true })
// A re-run on the same day must not overwrite the earlier digest: its threads are
// already marked surfaced, so the new one would be smaller and the rest lost.
const stamp = new Date(now).toISOString()
let file = join(dir, `${stamp.slice(0, 10)}.md`)
if (existsSync(file)) file = join(dir, `${stamp.slice(0, 10)}-${stamp.slice(11, 16).replace(':', '')}.md`)
writeFileSync(file, renderDigest(final, cfg, now))
for (const c of final) state.surfaced[c.thread.id] = { subreddit: c.thread.subreddit, at: now }
save()
console.log(`${final.length} candidate(s) → ${file}`)
