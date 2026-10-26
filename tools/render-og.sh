#!/usr/bin/env bash
# Render public/og.png — the card social platforms show when a link to the site
# is posted. It is a screenshot of og.html, which draws the real Fretboard with
# the real design tokens, so the picture can be regenerated whenever the board,
# the palette or the brand mark changes and can never drift from the product.
#
#   tools/render-og.sh                          # the card the site ships
#   tools/render-og.sh 'root=E&chord=maj7'      # any room query, for variants
#   OUT=/tmp/try.png tools/render-og.sh         # somewhere else
#
# Needs a Chrome-family browser (found on PATH, or set CHROME=) and ImageMagick.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=tools/render-lib.sh
. tools/render-lib.sh

QUERY="${1:-}"
OUT="${OUT:-public/og.png}"
PORT="${PORT:-5199}"

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

TMP="$(mktemp -d)"
npm run dev -- --port "$PORT" --strictPort >"$TMP/dev.log" 2>&1 &
DEV=$!
cleanup() { kill "$DEV" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

ready=""
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/og.html" >/dev/null; then
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

# preferredColorScheme=0 is Blink's "dark": the card is the dark theme whatever
# the machine rendering it prefers. Shoot at 2x and downsample — text and dot
# labels come out far cleaner than a native-resolution grab.
shoot_png "$TMP/card@2x.png" \
  --window-size=1200,630 --force-device-scale-factor=2 \
  --blink-settings=preferredColorScheme=0 \
  --virtual-time-budget=10000 \
  "http://localhost:$PORT/og.html?$QUERY"

magick "$TMP/card@2x.png" -resize 1200x630 -strip \
  -define png:compression-level=9 "$OUT"
echo "$(magick identify -format '%f — %wx%h, %b' "$OUT")"
