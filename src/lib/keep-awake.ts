import { KeepAwake } from '@capacitor-community/keep-awake'

/**
 * Hold the screen awake while the app makes sound on its own.
 *
 * Practice is the one thing here that runs without being touched: a metronome
 * clicks, a drone hums, a pattern walks the neck — and the device, seeing no
 * input, dims and locks mid-bar. So we ask it not to, for exactly as long as
 * something is sounding.
 *
 * One plugin call covers both deliverables (ADR-0003: native capability arrives
 * as a Capacitor plugin, never as forked behavior). On iOS it is
 * `UIApplication.isIdleTimerDisabled`; on the website it is the Screen Wake Lock
 * API, which the plugin also re-acquires after the tab comes back to the
 * foreground. Browsers without that API throw, and are handled below.
 *
 * The web half arrives as its own ~1 kB chunk, because the plugin resolves it
 * with a dynamic import. That costs the app nothing — inside the shell the
 * native proxy answers and the chunk is never fetched — and the website has no
 * offline claim to spend it against.
 */

/** What the app wants right now, and what the device has actually been told. */
let wanted = false
let applied = false
/** True while the drain loop below is mid-flight, so only one ever runs. */
let settling = false
/**
 * Latched off by the first `unavailable` — a browser with no Screen Wake Lock
 * would otherwise throw once per toggle, forever, for a nicety.
 */
let supported = true

/**
 * Ask for (or release) the hold. Fire-and-forget on purpose: callers are
 * synchronous store watchers, and nothing downstream cares when the promise
 * lands.
 */
export function keepScreenAwake(on: boolean): void {
  wanted = on
  void settle()
}

/**
 * Walk `applied` towards `wanted`. The plugin calls are promises and the
 * toggles are not — a fast stop/start would otherwise race — so intents queue
 * here instead, and the last one wins.
 */
async function settle(): Promise<void> {
  if (settling) return
  settling = true
  try {
    while (supported && wanted !== applied) {
      const target = wanted
      try {
        if (target) await KeepAwake.keepAwake()
        else await KeepAwake.allowSleep()
      } catch {
        // No wake lock here. Practice still works; the screen just dims.
        supported = false
        return
      }
      applied = target
    }
  } finally {
    settling = false
  }
}
