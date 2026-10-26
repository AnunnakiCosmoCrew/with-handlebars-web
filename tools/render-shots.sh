#!/usr/bin/env bash
# Render the App Store screenshot set — the slots App Store Connect asks for,
# both themes, one directory per slot. They are screenshots of shots.html,
# which mounts the real app with the real design tokens, so the pictures can be
# regenerated whenever the room changes and can never drift from the product.
#
#   tools/render-shots.sh                        # the whole set
#   SLOT=ipad-13 tools/render-shots.sh           # one slot
#   SHOT=board THEME=dark tools/render-shots.sh  # one shot, one theme
#   tools/render-shots.sh 'root=E&chord=maj7'    # any room query, for variants
#   OUT=/tmp/try tools/render-shots.sh           # somewhere else
#
# Writes $OUT/<slot>/<NN>-<slug>-<theme>.png. That directory is gitignored:
# the set is wanted at the moment of an upload and nowhere else, so this script
# is the artifact that is kept, not its output.
#
# Needs a Chrome-family browser (found on PATH, or set CHROME=) and ImageMagick.
# The grabs themselves are taken by tools/shots-capture.mjs over the DevTools
# protocol rather than by `chrome --screenshot`; that file says why.
set -euo pipefail

cd "$(dirname "$0")/.."

QUERY="${1:-}"
OUT="${OUT:-assets/screenshots}"

# 5196, below the splash's 5197, the icon's 5198 and the og card's 5199:
# rendering all four at once should work.
PORT="${PORT:-5196}"

# The --hb-bg literals from src/style.css. Spelled out here because flattening
# the alpha channel away needs a concrete colour to flatten onto; keep them in
# step with the tokens by hand — test/splash-colors.spec.ts is that hand.
LIGHT_BG='#f7f8fa'
DARK_BG='#101217'

# slug|points|scale — the pixels are points x scale, which is how Apple states
# the slot and how the device renders it. 6.9" is the only iPhone slot a
# submission needs; 6.5" is shot anyway because it costs one more pass and
# spares the listing Apple's automatic downscale. There is one iPad slot, and
# 1032pt sits above the 1000px breakpoint, so an iPad shot is always the wide
# two-column room (handlebars-docs/plans/ios-ipad-notes.md).
SLOTS=(
  "iphone-6.9|440x956|3"   # 1320x2868
  "iphone-6.5|428x926|3"   # 1284x2778
  "ipad-13|1032x1376|2"    # 2064x2752
)

# slug|slots|query — `slots` is `all` or a space-separated list.
#
# Every card defaults to open, so every query has to hide what it does not
# want: a room with all of them open is about 2500px tall and a shot is one
# viewport. Every shot here is composed to land above the fold out of the
# room's own show/hide params, so nothing has to be scrolled into frame — and
# a scrolled shot would lose the neck, which is the one thing every frame
# should have.
SHOTS=(
  # The product, and the same board as public/og.png — the store shot and the
  # link card are then one identity rather than two first impressions. Each
  # shot opens exactly one card under the neck, and a different one each time:
  # the neck is the constant, and across five frames the set has shown every
  # panel without ever being a list of collapsed headings.
  "board|all|root=A&scale=pentatonic-minor&roles=on&circle=show&info=show&staff=hide&pcard=hide&anatomy=hide"
  # The position and shape lenses — the thing a page of chord diagrams cannot
  # do — with Details naming what is lit.
  "positions|all|root=A&scale=pentatonic-minor&roles=on&box=2&shape=run&info=show&staff=hide&circle=hide&pcard=hide&anatomy=hide"
  # 23 tunings. `celtic` is DADGAD; there is no `dadgad` id in the core.
  "tunings|all|root=D&scale=mixolydian&tuning=celtic&roles=on&anatomy=show&staff=hide&circle=hide&pcard=hide&info=hide"
  # A quiz question with the neck as the answer sheet: labels off, the prompt
  # in the sticky bar, the practice panel opening underneath. Not on the iPad:
  # IP-06 has the quiz question reading twice in the two-column layout.
  "practice|iphone-6.9 iphone-6.5|root=A&scale=pentatonic-minor&practice=quiz&pcard=show&staff=hide&circle=hide&info=hide&anatomy=hide"
  # Notation with the playback row under it: sampled audio, in one frame.
  "notation|all|root=C&chord=maj7&staff=show&circle=hide&pcard=hide&info=hide&anatomy=hide"
  # iPad only: the two-column room. The shot that says "not a blown-up phone".
  "wide|ipad-13|root=A&scale=pentatonic-minor&roles=on&staff=show&circle=show&pcard=show&info=hide&anatomy=hide"
)

# An ad-hoc query replaces the table rather than joining it, so trying a board
# is one shot per slot instead of six. A control character in it could not be
# carried by the JSON below whatever the escaping, and cannot appear in a real
# room link, so it is refused here rather than escaped into something silently
# different from what was typed.
if [ -n "$QUERY" ]; then
  case "$QUERY" in
    *[[:cntrl:]]*)
      echo "the query contains a control character; a room link has none" >&2
      exit 1
      ;;
  esac
  SHOTS=("custom|all|$QUERY")
fi

# The capture job is JSON, and the strings going into it are a temp path and a
# URL carrying an arbitrary query. Backslash and double quote are the two
# characters JSON cannot take raw; unescaped, a query containing either would
# either break the parse or — worse — move the closing quote and hand the
# camera a different URL or output path than the one asked for.
json_string() { # <value>
  local s="${1//\\/\\\\}"
  printf '"%s"' "${s//\"/\\\"}"
}

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
cleanup() { kill "$DEV" 2>/dev/null || true; rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT

ready=""
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/shots.html" >/dev/null; then
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

# The plan, built once and then walked twice: the camera takes the whole list
# in one browser, and the post-process reads the same list back. Keeping them
# in one place is what stops a filter (SLOT=, SHOT=, THEME=) from applying to
# one and not the other.
raws=(); outs=(); bgs=(); sizes=()
jobs=""

for slot_row in "${SLOTS[@]}"; do
  IFS='|' read -r slot points scale <<<"$slot_row"
  [ -z "${SLOT:-}" ] || [ "${SLOT}" = "$slot" ] || continue

  w="${points%x*}"; h="${points#*x}"
  mkdir -p "$OUT/$slot"

  n=0
  for shot_row in "${SHOTS[@]}"; do
    n=$((n + 1))
    IFS='|' read -r slug slots query <<<"$shot_row"
    [ -z "${SHOT:-}" ] || [ "${SHOT}" = "$slug" ] || continue
    case " $slots " in
      *" all "* | *" $slot "*) ;;
      *) continue ;;
    esac

    for theme in light dark; do
      [ -z "${THEME:-}" ] || [ "${THEME}" = "$theme" ] || continue
      bg="$LIGHT_BG"
      [ "$theme" = dark ] && bg="$DARK_BG"

      raw="$TMP/$slot-$slug-$theme.png"
      raws+=("$raw")
      outs+=("$OUT/$slot/$(printf '%02d' "$n")-$slug-$theme.png")
      bgs+=("$bg")
      sizes+=("$((w * scale))x$((h * scale))")
      jobs="$jobs${jobs:+,}
    {\"out\":$(json_string "$raw"),
     \"url\":$(json_string "http://localhost:$PORT/shots.html?$query"),
     \"width\":$w,\"height\":$h,\"scale\":$scale,\"theme\":\"$theme\"}"
    done
  done
done

[ ${#outs[@]} -gt 0 ] || { echo "nothing matched SLOT/SHOT/THEME" >&2; exit 1; }

printf '{"chrome":"%s","shots":[%s]}' "$CHROME" "$jobs" |
  node tools/shots-capture.mjs

# -alpha remove flattens the transparency; -alpha off is what actually drops
# the channel, and dropping it is not cosmetic — App Store Connect rejects a
# screenshot that still has one. The flatten colour is invisible, since the
# body already paints --hb-bg; it exists so the channel can go.
#
# The size is asserted rather than resized into shape: a grab that came back
# the wrong size means the emulation did not take, and a resize would hide
# exactly that.
for i in "${!outs[@]}"; do
  raw="${raws[$i]}"; out="${outs[$i]}"
  want="${sizes[$i]}"
  got="$(magick identify -format '%wx%h' "$raw")"
  [ "$got" = "$want" ] || {
    echo "$out: the grab is $got, expected $want" >&2
    exit 1
  }
  magick "$raw" -background "${bgs[$i]}" -alpha remove -alpha off \
    -strip -define png:compression-level=9 "$out"
  echo "$(magick identify -format '%d/%f — %wx%h, %b' "$out")"
done

# The same check render-icon.sh ends on, for the same reason, over what this
# run actually wrote.
for out in "${outs[@]}"; do
  alpha="$(magick identify -format '%A' "$out")"
  [ "$alpha" = Undefined ] || {
    echo "$out still has an alpha channel ($alpha)" >&2
    exit 1
  }
done
