/**
 * iOS silences Web Audio when the ring/silent switch is flipped, because WebKit
 * starts every page on an *ambient* audio session. A fretboard is an instrument,
 * not a media player: the note has to sound with the switch on (ADR-0003 — this
 * is one of the behaviors the App Store submission rests on).
 *
 * The lever is the standard Audio Session API, not native code. WKWebView runs
 * its own audio session and has ignored the host app's `AVAudioSession` category
 * since 2017 (webkit.org/b/167788), so the `AVAudioSession` we configure in
 * `AppDelegate.swift` only declares the app's intent — it cannot reach the page.
 * `navigator.audioSession` can, in Safari 16.4+ and therefore in the shell too,
 * which is also why this is web code and not a Capacitor plugin: one
 * implementation for both deliverables, and iPhone Safari on withhandlebars.com
 * gets the fix for free.
 *
 * `'playback'` is exclusive — it pauses other apps' playback audio. That is the
 * trade Apple offers: `'ambient'` would mix with a backing track but go silent
 * on the switch again, and there is no type that does both.
 */
export type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record'

/** The slice of the API we use. Not in `lib.dom` yet, so we name it ourselves. */
type AudioSessionCapable = { audioSession?: { type: AudioSessionType } }

/**
 * Declare playback intent, so iOS keeps sounding with the ring/silent switch on.
 *
 * Idempotent and safe to call on every play. Returns whether the session now
 * reads as `'playback'` — false everywhere the API is absent (every non-WebKit
 * browser, and the test environment), which is not an error: those platforms
 * never muted us in the first place.
 *
 * Call it from a user gesture. Claiming the session is what pauses the music the
 * user had playing, so it should happen when they sound a note, not on load.
 */
export function claimPlaybackSession(nav: Navigator | undefined = globalThis.navigator): boolean {
  const session = (nav as (Navigator & AudioSessionCapable) | undefined)?.audioSession
  if (!session) return false
  if (session.type === 'playback') return true
  try {
    session.type = 'playback'
  } catch {
    // A conforming setter may reject a type; silence beats a thrown note.
    return false
  }
  return session.type === 'playback'
}
