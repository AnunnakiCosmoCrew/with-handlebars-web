# Contributing

Thanks for looking. This is a small project with a clear shape, so a short note
on how it works before you spend your time.

## This repo is a mirror

Development happens in a private repo; this one receives squashed **sync
release** commits, one per release. Two consequences:

- **Pull requests can't be merged here.** They're still welcome as a way to show
  exactly what you mean — a patch is worth a thousand words. Accepted changes are
  re-applied upstream with your authorship preserved, and land here on the next
  sync. Your PR gets closed with a link to the release commit that carries it.
- **The history is release-shaped**, not development-shaped. Don't read anything
  into the commit log; it isn't a record of how the code was written.

If that trade doesn't suit you, no hard feelings — an issue is just as valuable.

## Issues are the front door

Issues are open; Discussions are deliberately off, so anything you'd post in a
discussion belongs in an issue too — questions and half-formed ideas included.

**Every board is a URL.** Root, chord or scale, tuning, fret count, lens,
overlay, practice tab — all of it lives in the query string. So the single most
useful thing you can put in a bug report is **the link to the board that's
wrong**, plus what you expected instead:

> https://withhandlebars.com/?root=Bb&scale=lydian-augmented&tuning=celtic&box=3
> Position 3 is selected, but the staff underneath still shows position 2's
> notes. Firefox 141, macOS.

That's a complete report. It reproduces in one click.

## Which repo?

The theory and the drawing live apart, on purpose:

| It's about… | Goes to |
| --- | --- |
| Wrong notes, wrong spelling, wrong intervals, a missing scale or chord, a tuning that isn't there, roman numerals, harmonic function | [with-handlebars](https://github.com/AnunnakiCosmoCrew/with-handlebars) (the core) |
| Anything you can see, click, hear or share — the board, the lenses, the staff, the circle, practice, audio, layout, URLs, accessibility | here |

Not sure? File it here and it'll get moved. Guessing wrong costs nothing.

**Theory corrections need a source.** Name the tradition, book or convention you
are citing. "That's not how I learned it" is a real data point but it isn't
resolvable; "in Levine's chord/scale usage this is spelled ♭9, not ♯8" is.

## Sending a patch

The README has the two-repo setup — the core is a `file:` dependency from a
sibling checkout, so build it first. Then:

```bash
npm test        # must pass
npm run build   # must pass
```

House style, briefly:

- **No music theory in this repo.** If a component needs a theory answer, the
  answer belongs in the core and this repo asks for it. A `const SHARPS = [...]`
  in a Vue file is the one change guaranteed to be sent back.
- Colors, spacing and type come from the `--hb-*` tokens in `src/style.css`.
  Both light and dark themes have to survive your change.
- New behavior that a user would want to keep or share belongs in the URL, and
  in the store that reads it.
- Tests accompany behavior changes. The suite is fast; there is no excuse.

## Scope

The project favors **algorithmic generality over curated systems** — position
and pattern lenses are derived so they work for any scale in any tuning, rather
than transcribing a particular pedagogy's named shapes. Feature ideas that fit
that grain land easily. Ones that need a hand-maintained table of somebody
else's system are usually a no, and it's nothing personal.

## Conduct

Be decent to people. Assume the person you're replying to loves this instrument
as much as you do. That's the whole policy.

## License

By contributing you agree your work ships under the [MIT License](LICENSE).
There's no CLA.
