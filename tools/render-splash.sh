#!/usr/bin/env bash
# Render the iOS launch screen's brand mark — the 1x/2x/3x tiles the asset
# catalogue wants, one set per theme. They are screenshots of splash.html,
# which draws the real brand mark with the real design tokens, so the launch
# screen can be regenerated whenever the mark or the palette changes and can
# never drift from the product.
#
#   tools/render-splash.sh        # the tiles the app launches into
#
# Outputs assets/splash/ (the source of truth, shaped like the catalogue it
# feeds) and syncs it into Xcode's. Needs a Chrome-family browser (found on
# PATH, or set CHROME=) and ImageMagick.
#
# Unlike the app icon, these tiles keep their alpha channel. The plate behind
# the mark is painted by the SplashBackground colour set, not by the PNG: a
# tile with --hb-bg baked in would be a second copy of that colour arriving
# through a different colour-management path, and a one-bit disagreement on a
# flat field reads as a visible square.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=tools/render-lib.sh
. tools/render-lib.sh

# 128pt, so 128/256/384px. On the narrowest device the iOS 15 floor still
# admits that is 40% of the width; on a modern phone, a third. Change it here
# and in LaunchScreen.storyboard's constraints — test/launch-screen.spec.ts
# checks the two agree.
POINTS=128

# 5197, below the icon's 5198 and the og card's 5199: rendering all three at
# once should work.
PORT="${PORT:-5197}"

# Whatever this machine calls its browser; the macOS bundles aren't on PATH.
if [ -z "${CHROME:-}" ]; then
  for candidate in \
    "$(command -v google-chrome || true)" \
    "$(command -v google-chrome-stable || true)" \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      CHROME="$candidate"
      break
    fi
  done
fi
[ -n "${CHROME:-}" ] && [ -x "$CHROME" ] || {
  echo "no Chrome-family browser found — set CHROME=/path/to/chrome" >&2
  exit 1
}
command -v magick >/dev/null || { echo "ImageMagick (magick) is required" >&2; exit 1; }
# curl is checked too because its absence hides itself: the readiness probe
# below runs inside an `if`, so a missing curl is just a falsy condition, and
# the script would spend 30s blaming the dev server for not answering.
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }

TMP="$(mktemp -d)"
npm run dev -- --port "$PORT" --strictPort >"$TMP/dev.log" 2>&1 &
DEV=$!
cleanup() { kill "$DEV" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

ready=""
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/splash.html" >/dev/null; then
    ready=yes
    break
  fi
  sleep 0.5
done
[ -n "$ready" ] || {
  echo "dev server never answered on port $PORT after 30s:" >&2
  tail -20 "$TMP/dev.log" >&2
  exit 1
}

# The transparency the tiles need takes two things at once:
# --default-background-color=00000000 makes the compositor's base layer
# transparent (eight hex digits; all zeros sidesteps the ARGB-vs-RGBA question),
# and splash.html has to undo the --hb-bg that src/style.css puts on the body.
# Miss the second and the flag is a silent no-op — you get an opaque plate and
# no complaint, which is why the corner pixel is checked below rather than
# trusted. (Should a Chrome ever reject the flag, its pre-2018 spelling was a
# bare `=0`. Recovering alpha from a pair of white-and-black shots also works
# and is forty lines of -fx nobody will debug; don't.)
#
# One shot per theme. preferredColorScheme is Blink's: 0 is dark, 1 is light —
# so each tile is the theme it means to be, whatever the machine rendering it
# prefers. Shoot at 2x and downsample; the dot edges come out far cleaner than
# a native-resolution grab.
for variant in light dark; do
  scheme=1
  [ "$variant" = dark ] && scheme=0
  shoot_png "$TMP/$variant@2x.png" \
    --default-background-color=00000000 \
    --window-size=512,512 --force-device-scale-factor=2 \
    --blink-settings=preferredColorScheme=$scheme \
    --virtual-time-budget=10000 \
    "http://localhost:$PORT/splash.html"
  # On the raw grab as well as the outputs, so a browser that ignored the flag
  # is blamed for it rather than the resize.
  corner="$(magick "$TMP/$variant@2x.png" -format '%[fx:p{0,0}.a]' info:)"
  [ "$corner" = "0" ] || {
    echo "the $variant screenshot came back opaque (corner alpha $corner)." >&2
    echo "--default-background-color was ignored, or something in the page is" >&2
    echo "still painting a background — check splash.html's CSS override." >&2
    exit 1
  }
done

SET=assets/splash/SplashMark.imageset
mkdir -p "$SET"

# -background none keeps the transparent pixels transparent through the
# resample. PNG32: forces an RGBA encoding even where a tile happens to come
# out fully opaque, so the colour type stays a constant the test suite can read
# straight out of the file without ImageMagick in CI.
scale() { # <src> <size> <out>
  magick "$1" -background none -resize "$2x$2" \
    -strip -define png:compression-level=9 "PNG32:$3"
}

for variant in light dark; do
  suffix=""
  [ "$variant" = dark ] && suffix="-dark"
  scale "$TMP/$variant@2x.png" "$POINTS" "$SET/SplashMark$suffix.png"
  scale "$TMP/$variant@2x.png" "$((POINTS * 2))" "$SET/SplashMark$suffix@2x.png"
  scale "$TMP/$variant@2x.png" "$((POINTS * 3))" "$SET/SplashMark$suffix@3x.png"
done

# The inverse of the app icon's check. There an alpha channel is a submission
# blocker; here losing it is the bug.
for tile in "$SET"/*.png; do
  alpha="$(magick identify -format '%A' "$tile")"
  [ "$alpha" != Undefined ] || {
    echo "$tile lost its alpha channel" >&2
    exit 1
  }
  corner="$(magick "$tile" -format '%[fx:p{0,0}.a]' info:)"
  [ "$corner" = "0" ] || {
    echo "$tile has an opaque corner ($corner)" >&2
    exit 1
  }
  echo "$(magick identify -format '%f — %wx%h, %b' "$tile")"
done

# Keeping Xcode's copy in step. assets/splash/ is the source of truth and is
# shaped exactly like the catalogue, so this is two directory copies rather
# than a file-by-file dance. Wholesale, not a merge: a stale catalogue index is
# not harmless, and Capacitor's stock Splash.imageset is retired here too, so a
# re-run of `cap add ios` can't quietly bring it back.
CAT="ios/App/App/Assets.xcassets"
if [ -d "$CAT" ]; then
  rm -rf "$CAT/Splash.imageset" "$CAT/SplashMark.imageset" "$CAT/SplashBackground.colorset"
  cp -R assets/splash/SplashMark.imageset assets/splash/SplashBackground.colorset "$CAT/"
  echo "synced into $CAT"
else
  echo "no ios/ yet — assets/splash/ is ready for it"
fi
