import { isNativeApp } from './platform.js'
import { DEFAULT_STATE, stateLocation, type RoomState } from './url-state.js'

/**
 * Handing the current board to someone else. The room already keeps its whole
 * state in the query string, so a shareable board is a URL — this module only
 * has to name the origin, and pick the sheet that exists here.
 */

/**
 * Where a shared board lives. Deliberately not `location.origin`: inside the
 * app that is the shell's own local origin, which resolves nowhere for the
 * person receiving the link. The site is the canonical home of every board
 * (it is the origin `index.html` names as canonical), and universal links let
 * the app claim these links back where it is installed (HB-59,
 * `universal-links.ts`).
 */
export const SITE_ORIGIN = 'https://withhandlebars.com'

/**
 * The absolute link to a board — the same location the address bar carries:
 * the board's own page when it has one (HB-153), so the link a person shares is
 * the canonical one, with any lens settings as a query on top; the room with
 * the whole state in the query otherwise.
 *
 * Never the bare origin: on the site that shows the *visitor's* last board, so
 * an all-default board would arrive as whatever the recipient had open. Naming
 * one field explicitly (the default root) makes it a board link like any other,
 * which the room then opens on defaults (`initialState` in `room.ts`).
 */
export function permalink(state: RoomState): string {
  const at = stateLocation(state)
  return `${SITE_ORIGIN}${at === '/' ? `/?${new URLSearchParams({ root: DEFAULT_STATE.root })}` : at}`
}

/**
 * What actually happened, so the caller knows whether to say anything: a share
 * sheet speaks for itself, a silent clipboard write does not.
 */
export type ShareOutcome = 'shared' | 'copied' | 'unavailable'

type ShareTarget = { title: string; url: string }

async function copy(url: string): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return 'unavailable'
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'unavailable'
  }
}

/**
 * A dismissed sheet is a finished share, not a failure — only a broken one
 * falls through to the clipboard.
 *
 * Read the fields off whatever was thrown rather than asking `instanceof
 * Error`: a cancelled `navigator.share` rejects with a `DOMException`, and the
 * Capacitor bridge hands back a plain object shaped like an error. Neither is
 * reliably an `Error`, and mistaking a dismissal for a failure would copy a
 * link the user just declined to share.
 */
function dismissed(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { name, message } = err as { name?: unknown; message?: unknown }
  return name === 'AbortError' || (typeof message === 'string' && /cancel/i.test(message))
}

/**
 * Offer the board to the best sheet this shell has, and fall back to the
 * clipboard where there is none (desktop browsers, mostly).
 *
 * The board's name rides along as the sheet's title only, never as `text`: a
 * sheet given both hands the *text* to Copy and to plain-text targets, and a
 * message reading "E" with no link is worse than useless. The link is the
 * payload; the title is what the sheet calls it.
 *
 * The plugin is imported dynamically on purpose. `@capacitor/share` pulls in
 * `@capacitor/core`, which registers its plugins and *assigns*
 * `window.Capacitor` — on the plain website, where `platform.ts` goes out of
 * its way not to create that global. Loading it only once we are demonstrably
 * inside the app keeps the site's bundle and its globals untouched.
 */
export async function shareBoard({ title, url }: ShareTarget): Promise<ShareOutcome> {
  if (isNativeApp()) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title, url, dialogTitle: 'Share this board' })
      return 'shared'
    } catch (err) {
      if (dismissed(err)) return 'shared'
      return copy(url)
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (err) {
      if (dismissed(err)) return 'shared'
      return copy(url)
    }
  }

  return copy(url)
}

/** Whether there is any way to share at all — the button hides itself if not. */
export function canShareBoard(): boolean {
  if (isNativeApp()) return true
  if (typeof navigator === 'undefined') return false
  return Boolean(navigator.share || navigator.clipboard?.writeText)
}
