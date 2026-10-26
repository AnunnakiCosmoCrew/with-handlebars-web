#!/usr/bin/env bash
# Render the app icon set — the 1024px squares Xcode's asset catalogue wants,
# plus every icon the site serves. They are screenshots of icon.html, which
# draws the real brand mark with the real design tokens, so the icons can be
# regenerated whenever the mark or the palette changes and can never drift from
# the product.
#
#   tools/render-icon.sh          # the set the app ships
#
# Outputs assets/appicon/ (the source of truth, hand-off to `cap add ios`),
# public/apple-touch-icon.png, and the three PNGs behind public/site.webmanifest.
# Needs a Chrome-family browser (found on PATH, or set CHROME=) and ImageMagick.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=tools/render-lib.sh
. tools/render-lib.sh

# The --hb-bg literals from src/style.css. Spelled out here because flattening
# the alpha channel away needs a concrete colour to flatten onto; keep them in
# step with the tokens by hand.
LIGHT_BG='#f7f8fa'
DARK_BG='#101217'

# 5198, not the og card's 5199: rendering both at once should work.
PORT="${PORT:-5198}"

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
  if curl -sf "http://localhost:$PORT/icon.html" >/dev/null; then
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

# preferredColorScheme is Blink's: 0 is dark, 1 is light — so each icon is the
# theme it means to be, whatever the machine rendering it prefers. Shoot at 2x
# and downsample; the dot edges come out far cleaner than a native-resolution
# grab.
shoot() { # <name> <scheme> [query]
  shoot_png "$TMP/$1@2x.png" \
    --window-size=1024,1024 --force-device-scale-factor=2 \
    --blink-settings=preferredColorScheme=$2 \
    --virtual-time-budget=10000 \
    "http://localhost:$PORT/icon.html${3:+?$3}"
}

shoot light 1
shoot dark 0
# A third shot rather than a third theme. Android maps a maskable icon onto the
# adaptive-icon layer, where only the central 72/108 of the width survives the
# crop and the circle guaranteed visible under every launcher's mask is 66/108
# — 61%, tighter than the 80% usually quoted. The App Store plate's 640px mark
# reaches 326px from centre (the nut line's corners, not the dots) against the
# 313px that circle allows, so it clips. At 512 it reaches 261px. Same
# component, same tokens, one prop.
shoot maskable 1 'mark=512'

mkdir -p assets/appicon

# -alpha remove flattens the transparency; -alpha off is what actually drops
# the channel, and dropping it is not cosmetic — App Store Connect rejects an
# icon that still has one.
flatten() { # <src> <bg> <size> <out>
  magick "$1" -resize "$3x$3" -background "$2" -alpha remove -alpha off \
    -strip -define png:compression-level=9 "$4"
}

flatten "$TMP/light@2x.png" "$LIGHT_BG" 1024 assets/appicon/AppIcon-1024.png
flatten "$TMP/dark@2x.png" "$DARK_BG" 1024 assets/appicon/AppIcon-1024-dark.png
flatten "$TMP/light@2x.png" "$LIGHT_BG" 180 public/apple-touch-icon.png

# The web manifest's set. Light in every role because a manifest carries one
# icon set and one background_color, with no prefers-color-scheme to switch on
# — and apple-touch-icon.png above is already the light plate, so the site's
# installed identity stays one thing. 192 and 512 are the pair Chrome asks for.
flatten "$TMP/light@2x.png" "$LIGHT_BG" 192 public/icon-192.png
flatten "$TMP/light@2x.png" "$LIGHT_BG" 512 public/icon-512.png
flatten "$TMP/maskable@2x.png" "$LIGHT_BG" 512 public/icon-maskable-512.png

# The tinted variant is defined as a luminance mapping of the icon — iOS
# supplies the tint gradient itself, and a coloured asset looks wrong under
# every accent. Deriving it from the dark plate guarantees it is the same art
# rather than a fourth palette to keep in step; the mild stretch keeps the dots
# separated from the plate once the colour is gone.
magick assets/appicon/AppIcon-1024-dark.png \
  -colorspace Gray -linear-stretch 1%x1% -alpha off \
  -strip -define png:compression-level=9 assets/appicon/AppIcon-1024-tinted.png

for icon in assets/appicon/*.png public/apple-touch-icon.png public/icon-*.png; do
  alpha="$(magick identify -format '%A' "$icon")"
  [ "$alpha" = Undefined ] || {
    echo "$icon still has an alpha channel ($alpha)" >&2
    exit 1
  }
  echo "$(magick identify -format '%f — %wx%h, %b' "$icon")"
done

# The hand-off to `cap add ios`. Never create ios/ here: cap refuses to run if
# the directory already exists, so assets/appicon/ is the source of truth and
# this only keeps Xcode's copy in step once the native project is there.
SET="ios/App/App/Assets.xcassets/AppIcon.appiconset"
if [ -d "$SET" ]; then
  # Wholesale, not a merge: Capacitor's template leaves its own Contents.json
  # and AppIcon-512@2x.png behind, and a stale catalogue index is not harmless.
  rm -f "$SET"/*.png "$SET/Contents.json"
  cp assets/appicon/*.png assets/appicon/Contents.json "$SET/"
  echo "synced into $SET"
else
  echo "no ios/ yet — assets/appicon/ is ready for it"
fi
