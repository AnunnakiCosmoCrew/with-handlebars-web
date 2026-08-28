# With Handlebars

**Master scales and chords on the guitar.** Pick a root and a chord or scale and
see every occurrence of its tones across the whole neck — in any tuning, with
strict enharmonic spelling, theory that shows its work, and sampled sound.

Live at **[withhandlebars.pages.dev](https://withhandlebars.pages.dev)**.

## What's in it

- **The whole neck, any tuning** — 58 chord qualities and 168 scales across 23
  tunings (plus per-string detuning), up to 24 frets, left- or right-handed.
- **Lenses, not clutter** — narrow the board to one position, one string, the
  octaves of a note, or the guide tones that carry the harmony.
- **Theory that shows its work** — tone roles in color, roman numerals on the
  diatonic overlay, the circle of fifths, notation, and plain-language anatomy
  of whatever you're looking at.
- **A practice room** — quizzes, pattern runs, progression playback with
  voice-led chords, a metronome, and a tonic drone to play against.
- **Real sound** — sampled guitars, self-hosted (no external requests at
  runtime).
- **Shareable boards** — every setting lives in the URL, so any board is a link
  you can send to a student, a bandmate, or yourself next week.

## Development

The music theory lives in its own library,
[with-handlebars](https://github.com/AnunnakiCosmoCrew/with-handlebars),
consumed as a `file:` dependency from a sibling checkout:

```bash
git clone https://github.com/AnunnakiCosmoCrew/with-handlebars.git
git clone https://github.com/AnunnakiCosmoCrew/with-handlebars-web.git
cd with-handlebars && npm ci && npm run build
cd ../with-handlebars-web && npm ci && npm run dev
```

After changing the core, rebuild it (`npm run build` in `../with-handlebars`)
and restart the dev server.

```bash
npm test        # component + store + audio test suite
npm run build   # production build into dist/
```

Stack: Vite + Vue 3 + TypeScript, Pinia for state, a hand-rolled SVG fretboard,
and [smplr](https://github.com/danigb/smplr) for sampled playback. No music
theory is computed in this repo — if a component needs a theory answer, it
belongs in the core.

## Credits

Guitar samples from the MusyngKite soundfont via
[midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (MIT).

## License

[MIT](LICENSE) © Anunnaki Cosmo Crew
