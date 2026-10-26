# With Handlebars

**Master scales and chords on the guitar.** Pick a root and a chord or scale and
see every occurrence of its tones across the whole neck — in any tuning, with
strict enharmonic spelling, theory that shows its work, and sampled sound.

Live at **[withhandlebars.com](https://withhandlebars.com)**, and on the
[App Store](https://apps.apple.com/app/with-handlebars/id6815550767) as the same
build in a native shell.

## What's in it

- **The whole neck, any tuning** — 58 chord qualities and 168 scales across 30
  tunings for guitar, bass and ukulele (plus per-string detuning), up to 24
  frets, left- or right-handed.
- **Lenses, not clutter** — narrow the board to one position, one string, the
  octaves of a note, or the guide tones that carry the harmony.
- **Theory that shows its work** — tone roles in color, roman numerals on the
  diatonic overlay, the circle of fifths, notation, and plain-language anatomy
  of whatever you're looking at.
- **A practice room** — quizzes, pattern runs, progression playback with
  voice-led chords, a metronome, and a tonic drone to play against.
- **Real sound** — sampled guitars, self-hosted (no external requests at
  runtime).
- **Every board is a link** — every setting lives in the URL, so any board can
  be sent to a student, a bandmate, or yourself next week. Each chord and scale
  in standard tuning also has a page of its own, with a preview card of that
  exact neck ([A minor 7](https://withhandlebars.com/standard/a/chord/minor-7/));
  [/boards/](https://withhandlebars.com/boards/) lists them.
- **Works offline** — a service worker caches the app on the first visit, so
  the next tap plays without a network. No account, no cookies, no analytics.

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
npm run og      # re-render public/og.png, the link-preview card
```

The link-preview card is a screenshot of `og.html`, which draws the real
fretboard with the real design tokens — so it is regenerated rather than
hand-drawn whenever the board, the palette or the brand mark changes. It needs
a Chrome-family browser and ImageMagick.

Board pages and `sitemap.xml` are generated at build time from
`tools/boards/tier1.json`. Their per-board social cards are rendered only when
`HB_OG_CARDS=1` is set (they need Playwright's Chromium), so a plain
`npm run build` needs no browser.

### Building the iOS app

`ios/` is a Capacitor shell around the same `dist/` build — Simulator-ready
out of the box:

```bash
npm run build:ios   # build the web bundle, then `cap sync` it into ios/
npm run ios:open    # open ios/App/App.xcodeproj in Xcode
npm run ios:run     # build:ios + boot the Simulator, one command
```

Requires Xcode 26+ and an iOS 15+ Simulator runtime. Capacitor 8 uses Swift
Package Manager, so `ios/App/App.xcodeproj` builds on its own — no
`pod install`, no `.xcworkspace` to open instead.

**What's absent on purpose:** no signing or provisioning material ships in
this mirror — no `.mobileprovision`, `.p12`/`.cer`/`.certSigningRequest`/`.p8`
files, no `ExportOptions.plist`, no `fastlane/`. That's enough to build and
run in the Simulator; running on a physical device or archiving for
TestFlight/the App Store needs your own Apple Developer signing team, set in
Xcode under Signing & Capabilities.

Stack: Vite + Vue 3 + TypeScript, Pinia for state, a hand-rolled SVG fretboard,
and [smplr](https://github.com/danigb/smplr) for sampled playback. No music
theory is computed in this repo — if a component needs a theory answer, it
belongs in the core.

## Contributing

Issues are the front door — and because every board is a URL, a bug report can
be one link. See [CONTRIBUTING.md](CONTRIBUTING.md); it explains what to file
where, and how patches reach this repo (it's a release mirror, so pull requests
take a slightly unusual route).

## Credits

Guitar samples from the MusyngKite soundfont via
[midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (MIT).

## License

[MIT](LICENSE) © Anunnaki Cosmo Crew
