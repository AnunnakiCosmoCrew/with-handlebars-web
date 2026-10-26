/**
 * Haptic feedback for practice: a quiz answer you can feel without watching the
 * screen, and a downbeat you can feel while your eyes are on the neck.
 *
 * Native-only by nature — there is no Taptic Engine behind a browser tab, and
 * iOS Safari has no Vibration API — so every call here is a no-op on
 * withhandlebars.com, and the control that governs it does not render there.
 */
import { ref, watch } from 'vue'
import { isNativeApp } from './platform.js'

/** Its own key, deliberately outside the room's: see the module comment below. */
const STORAGE_KEY = 'handlebars.haptics.v1'

type HapticsModule = typeof import('@capacitor/haptics')

/**
 * The plugin, imported lazily and at most once.
 *
 * The dynamic import is the point, not an optimization. `@capacitor/haptics`
 * pulls in `@capacitor/core`, which *assigns* `window.Capacitor` wherever it
 * loads — the global `platform.ts` goes out of its way never to create on the
 * website. Behind the `isNativeApp()` guard in `fire()` this module is only
 * ever fetched inside the app, so the web bundle keeps that promise.
 */
let loading: Promise<HapticsModule | null> | null = null

function load(): Promise<HapticsModule | null> {
  // A plugin that fails to load must not take a quiz answer down with it.
  loading ??= import('@capacitor/haptics').catch(() => null)
  return loading
}

function loadEnabled(): boolean {
  try {
    // Default on: someone who reaches for a practice app on a phone wants the
    // feedback. Only an explicit opt-out turns it off.
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Whether haptics are wanted, as a device preference rather than room state.
 *
 * It stays out of `RoomState` on purpose: every field there is serialized into
 * the shared permalink, and how your phone buzzes is not part of the board you
 * shared with someone. Hence a key of its own instead of the room's.
 */
export const hapticsEnabled = ref(loadEnabled())

watch(hapticsEnabled, on => {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Private browsing, or a storage quota — the preference just won't persist.
  }
})

/** Whether the toggle is worth showing at all: only the app can buzz. */
export function hapticsAvailable(): boolean {
  return isNativeApp()
}

function fire(tap: (m: HapticsModule) => Promise<void>): void {
  if (!hapticsAvailable() || !hapticsEnabled.value) return
  // Fire and forget. Callers are a quiz answer and a scheduled beat; neither
  // may wait on the Taptic Engine, and neither may fail because of it.
  void load()
    .then(m => m && tap(m))
    .catch(() => {})
}

export const haptics = {
  /** A right answer. */
  right(): void {
    fire(m => m.Haptics.notification({ type: m.NotificationType.Success }))
  },

  /** A wrong one — warning, not error: you missed a note, nothing broke. */
  wrong(): void {
    fire(m => m.Haptics.notification({ type: m.NotificationType.Warning }))
  },

  /**
   * A metronome downbeat. Light: this can land once a bar for minutes on end,
   * and it is a pulse to feel under the music, not a knock to notice.
   */
  accent(): void {
    fire(m => m.Haptics.impact({ style: m.ImpactStyle.Light }))
  },
}
