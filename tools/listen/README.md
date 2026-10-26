# Reddit listening digest (HB-162)

A read-only script that, once a day, finds Reddit threads where a Handlebars deep
link is the honest answer and writes a short Markdown digest. **The founder writes
every reply.** The script never posts, votes or messages: it only issues GET requests
to the official Data API.

It is not part of the app: no dependency on the bundle, not a build input, not in the
Pages deploy or the iOS app.

## Setup

1. Register a **script** app at <https://www.reddit.com/prefs/apps> (read-only use).
2. Put its credentials in `tools/listen/credentials.json` (untracked, never committed):
   `{ "clientId": "…", "clientSecret": "…" }`
3. Set your Reddit username in `userAgent` in `config.json`.

## Use

```
npm run listen                          # writes tools/listen/digests/YYYY-MM-DD.md
npm run listen -- --answered <id|url>   # you replied, with a link
npm run listen -- --answered <id> --no-link
```

Run it by hand or from a LaunchAgent. Digests, `state.json` (threads surfaced and
answered) and credentials are gitignored.

## What it does

- Reads `/new` of the subreddits in `config.json` (never r/Guitar or r/musictheory).
- Keeps threads old enough (`minThreadAgeMinutes`), young enough (`maxThreadAgeHours`)
  and with few answers (`maxComments`) that match an intent phrase.
- Drops threads already surfaced, threads that already link to withhandlebars.com
  (post or comments), and any subreddit that had a linked reply in the last 7 days.
- Scores intent matches, freshness, few comments, and whether a tier-1 board answers
  it ("E minor pentatonic" → `/standard/e/scale/pentatonic-minor/`; a thread that
  names no root gets no link). Paths come from `tools/boards/tier1.json`, the
  generator's own list.
- Offers 3–5 threads, at most `weeklyLinkCap` per subreddit.

## Rules for replying

1. **9:1.** Nine helpful comments for every one that carries a link; r/Guitar-style
   ratios apply everywhere.
2. **One linked reply per subreddit per week.** Mark answers with `--answered` so the
   script honours it.
3. **Disclose** "I built this" whenever you link.
4. **Link only when it is the answer.** Answer in words first; skip the thread if the
   board is not what they asked for.
5. Read the subreddit's own rule (quoted in each digest entry) before posting.
