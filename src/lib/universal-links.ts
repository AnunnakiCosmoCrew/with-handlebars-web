import { isNativeApp } from './platform.js'
import { SITE_ORIGIN } from './share.js'
import { boardFromPath } from './board-path.js'
import { DEFAULT_STATE, boardState, buildQuery, parseQuery } from './url-state.js'

/**
 * Shared boards open in the app (HB-59). A board is a withhandlebars.com URL whose
 * query carries the whole room, or a tier-1 board's own page (`share.ts`,
 * HB-153), and the domain's apple-app-site-association claims exactly those
 * paths — `/` and the board paths — for this app. So a
 * link tapped in Messages or Mail arrives here instead of in Safari, and all the
 * app has to do is load the same query the site would have.
 *
 * It loads it the way the site does: by navigating. The room store resolves its
 * state once, and a URL that names a board is taken as the whole board
 * (`initialState` in `room.ts`). Re-entering through that front door means a link
 * shows exactly what the sender saw, through the one code path that already
 * validates a query — no second parser, no store mutation that could disagree
 * with a fresh load.
 */

type Here = { search: string }

/**
 * Where the shell should go for an incoming link, or `null` when it should stay put.
 *
 * Stays put for anything that is not a board on the site's origin (the claim is
 * only `/`, but a link is input and is checked rather than trusted), for the bare
 * origin — it names no board (`permalink()` never produces it), and on the site
 * it shows the visitor's own last board, so the app keeps the current one — and
 * for the board already on screen, which would otherwise reload for nothing.
 */
export function boardLocation(url: string, here: Here): string | null {
  let link: URL
  try {
    link = new URL(url)
  } catch {
    return null
  }
  if (link.origin !== SITE_ORIGIN) return null
  // A board page's link (HB-153) is opened as the room's query for the same board:
  // the shell is the app's only page, and the query is the form it already loads.
  const board = boardFromPath(link.pathname)
  if (board) {
    const query = buildQuery({ ...DEFAULT_STATE, ...parseQuery(link.search), ...boardState(board) })
    const search = `?${query || new URLSearchParams({ root: DEFAULT_STATE.root })}`
    return search === here.search ? null : `/${search}`
  }
  if (link.pathname !== '/') return null
  if (!link.search || link.search === here.search) return null
  return `/${link.search}`
}

/**
 * Start listening for shared boards. Native-only, so the plugin is imported lazily
 * behind `isNativeApp()` (ADR-0005): the website never loads `@capacitor/app`, and
 * a board link opened in a browser is already the page it names.
 *
 * Cold launches need nothing extra. The plugin posts `appUrlOpen` with
 * `retainUntilConsumed`, so a link that launched the app is held until this
 * listener attaches, then delivered like any other.
 */
export async function listenForBoardLinks(): Promise<void> {
  if (!isNativeApp()) return
  const { App } = await import('@capacitor/app')
  await App.addListener('appUrlOpen', ({ url }) => {
    const next = boardLocation(url, location)
    if (next) location.replace(next)
  })
}
