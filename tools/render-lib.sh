# Shared by the render scripts, which are otherwise deliberately self-contained.
# The Chrome discovery block and the preflight checks are still copied into each
# one: they have never needed a coordinated change. This has.
#
# Source it anywhere after the `cd` to the repo root; the only requirement is
# that CHROME names an executable browser by the time shoot_png is *called*,
# which is why the scripts source it up front and discover Chrome afterwards.

# Take one screenshot and come back.
#
# Since Chrome 152 that is not the same thing as running Chrome and waiting for
# it: the browser writes the PNG on time and then does not exit, so a script
# that waits on the process hangs after its work is already done. The old
# headless mode, which did exit, was removed in the same release, and
# --virtual-time-budget makes no difference — the file is byte-identical at 1s
# and at 10s, and the process sits there either way.
#
# So this waits on the output instead: poll until the file exists and has
# stopped growing, then stop the browser. Callers read the result with
# ImageMagick immediately afterwards, which is what would catch a half-written
# PNG if the two-poll settle were ever too eager.
shoot_png() { # <out> <chrome args...>
  local out="$1"
  shift
  rm -f "$out"
  "$CHROME" --headless --disable-gpu --hide-scrollbars "$@" --screenshot="$out" \
    >/dev/null 2>&1 &
  local pid=$! size prev=-1 stable=0
  for _ in $(seq 1 240); do
    kill -0 "$pid" 2>/dev/null || break
    size=0
    [ -f "$out" ] && size="$(wc -c <"$out")"
    if [ "$size" -gt 0 ] && [ "$size" = "$prev" ]; then
      stable=$((stable + 1))
      [ "$stable" -ge 2 ] && break
    else
      stable=0
    fi
    prev="$size"
    sleep 0.5
  done
  # Bounded, then insistent. An unbounded `wait` here would reintroduce exactly
  # the hang this helper exists to remove, one signal later — and a browser
  # that has already stopped honouring "you are finished" is not the one to
  # extend unlimited credit to about SIGTERM.
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  kill -9 "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  [ -s "$out" ] || {
    echo "the browser produced no screenshot for $out within 120s" >&2
    exit 1
  }
}
