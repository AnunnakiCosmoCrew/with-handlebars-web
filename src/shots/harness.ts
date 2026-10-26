/**
 * The context an App Store screenshot needs, and the room does not supply.
 *
 * `shots.html` mounts the real `App.vue` — a store screenshot has to be the
 * product, not a sheet that resembles it — so everything here is about making
 * the *browser* behave like the shell the app runs in. Kept apart from
 * `main.ts` so `test/shots-harness.spec.ts` can hold each piece to its promise;
 * the Ko-fi one is a submission blocker, not a nicety.
 */

type CapacitorStub = {
  getPlatform: () => string
  isNativePlatform: () => boolean
}

type StubbedWindow = Window & {
  Capacitor?: CapacitorStub
  CapacitorCustomPlatform?: { name: string }
}

/**
 * Make `isNativeApp()` (src/lib/platform.ts) answer true, so the page renders
 * as the app rather than as the website. Two things hang off it, and they pull
 * in opposite directions — which is exactly why this exists:
 *
 * - The Ko-fi pill (`showSupportLink` in App.vue) must be **absent**. An
 *   external donation link in a store screenshot is Guideline 3.1.1 territory,
 *   and ADR-0003 keeps it out of the app for that reason.
 * - The practice panel's Buzz toggle (`hapticsAvailable()`) must be
 *   **present**. It is one of the app's answers to Guideline 4.2 — "this is
 *   not a wrapper" — and the website never draws it.
 *
 * Module hoisting does not threaten either. `showSupportLink` is evaluated in
 * `setup()`, at mount, which is the last thing main.ts does; and
 * `@capacitor/core` is never in App.vue's static graph, because every plugin
 * in src/lib/ is a dynamic import behind an isNativeApp() guard (ADR-0005).
 *
 * `CapacitorCustomPlatform` is set as well because core, if some future static
 * import ever pulls it in, reads `win.Capacitor || {}` and then *overwrites*
 * `getPlatform`/`isNativePlatform` on whatever it finds — an earlier
 * assignment loses. `CapacitorCustomPlatform` is the one input it honours. So
 * this belongs here rather than in an inline <head> script, which would be
 * earlier and therefore strictly easier to clobber.
 */
export function nativeStub(): void {
  const win = window as StubbedWindow
  win.Capacitor = { getPlatform: () => 'ios', isNativePlatform: () => true }
  win.CapacitorCustomPlatform = { name: 'ios' }
}

/**
 * A deterministic Math.random, so a re-render of the same shot is the same
 * picture. The quiz picks its question with Math.random (src/stores/practice.ts),
 * which would otherwise make the practice shot different prose every run —
 * impossible to diff, and a nuisance when only one slot needs re-shooting.
 *
 * mulberry32: 32-bit state, one multiply-xorshift round. Nothing here is
 * cryptography; it needs to be short, seeded and the same everywhere.
 */
export function seedRandom(seed = 1): void {
  let a = seed >>> 0
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Empty the remembered room before the store reads it. `loadStored()` in
 * src/stores/room.ts merges localStorage *under* the URL query, so a field a
 * shot's query does not mention comes from whatever the last shot left behind
 * — one shot opening the quiz would put a quiz in the next shot's picture. The
 * renderer also gives each shot its own Chrome profile; this is the half that
 * survives someone opening the page by hand.
 */
export function clearRoomState(): void {
  try {
    localStorage.clear()
  } catch {
    /* storage unavailable — nothing was remembered, which is the goal */
  }
}

/**
 * Stamp the pointer type the browser is reporting onto the root element, so
 * the camera can read it back and refuse to shoot.
 *
 * Headless Chrome reports `pointer: fine` unless touch emulation is turned on,
 * and that media query is where the 44pt tap floor in src/style.css lives — a
 * shot taken without it is a picture of the website wearing a phone's
 * dimensions. tools/shots-capture.mjs asks for the emulation; this is how it
 * finds out whether it arrived.
 */
export function reportPointerType(): void {
  document.documentElement.dataset.pointer = window.matchMedia('(pointer: coarse)').matches
    ? 'coarse'
    : 'fine'
}
