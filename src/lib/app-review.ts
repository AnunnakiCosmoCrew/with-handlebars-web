import { isNativeApp } from './platform.js'

/**
 * Asking for an App Store rating (HB-171). Native app only: on the website
 * every call here is a no-op, and the plugin is never fetched.
 *
 * The quiz has no end state, so a *quiz session* is defined as leaving quiz
 * mode after at least `MIN_ANSWERS` answers. The review is requested when the
 * `SESSIONS_BEFORE_ASK`th session ends, once per install. Apple decides whether
 * the sheet actually shows (at most three a year); we only request. No custom
 * UI and no analytics (ADR-0003).
 */
export const MIN_ANSWERS = 10
export const SESSIONS_BEFORE_ASK = 4

/** Device-local, outside the room state and the permalink (the `hb-…` convention). */
export const SESSIONS_KEY = 'hb-quiz-sessions'
export const ASKED_KEY = 'hb-review-asked'

type ReviewModule = typeof import('@capacitor-community/in-app-review')

/** Lazy, so the website never loads the plugin (or the `window.Capacitor` core assigns). */
function load(): Promise<ReviewModule | null> {
  return import('@capacitor-community/in-app-review').catch(() => null)
}

/**
 * A quiz session just ended with `answers` answers given. Counts it if it
 * qualifies and requests the review when it is the one. Returns whether a
 * request was made.
 *
 * Without readable, writable storage it does nothing: it could not remember
 * having asked, and would ask again after every session.
 */
export function quizSessionEnded(answers: number): boolean {
  if (!isNativeApp() || answers < MIN_ANSWERS) return false
  let sessions: number
  try {
    if (localStorage.getItem(ASKED_KEY) !== null) return false
    sessions = (Number(localStorage.getItem(SESSIONS_KEY)) || 0) + 1
    localStorage.setItem(SESSIONS_KEY, String(sessions))
    if (sessions < SESSIONS_BEFORE_ASK) return false
    localStorage.setItem(ASKED_KEY, new Date().toISOString())
  } catch {
    return false
  }
  void load().then(m => m?.InAppReview.requestReview()).catch(() => {})
  return true
}
