import inventory from '../../tools/boards/tier1.json'

/**
 * Board paths (HB-153, handlebars-docs ADR-0009). A tier-1 board has a page of
 * its own at `/<tuning>/<root>/<kind>/<type>/`, built at `npm run build`
 * (`tools/board-pages-plugin.ts`). The path names exactly four fields — tuning,
 * root, mode and the chord or scale — and everything else stays in the query,
 * so no lens or display setting ever makes a page of its own.
 *
 * The slugs come from `tools/boards/tier1.json`, the one list the generator,
 * the sitemap and this module read: core ids never appear in a path, and a
 * board outside the inventory has no path (it keeps the `/?…` form).
 */

export type BoardKind = 'chord' | 'scale'

/** The part of the room state a board path names. */
export type Board = { tuningId: string; root: string; mode: BoardKind; typeId: string }

type Slugged = { slug: string; id: string }

const byId = (entries: Slugged[]) => new Map(entries.map(e => [e.id, e.slug]))
const bySlug = (entries: Slugged[]) => new Map(entries.map(e => [e.slug, e.id]))

const ROOTS = inventory.roots.map(r => ({ slug: r.slug, id: r.root }))
const TYPES: Record<BoardKind, Slugged[]> = { chord: inventory.chords, scale: inventory.scales }

const SLUG = {
  tuning: byId(inventory.tunings),
  root: byId(ROOTS),
  chord: byId(TYPES.chord),
  scale: byId(TYPES.scale),
}
const ID = {
  tuning: bySlug(inventory.tunings),
  root: bySlug(ROOTS),
  chord: bySlug(TYPES.chord),
  scale: bySlug(TYPES.scale),
}

/** Every tier-1 board, tuning by root by kind by type, in inventory order. */
export const BOARDS: Board[] = inventory.tunings.flatMap(t =>
  ROOTS.flatMap(r =>
    (['chord', 'scale'] as const).flatMap(mode =>
      TYPES[mode].map(type => ({ tuningId: t.id, root: r.id, mode, typeId: type.id })),
    ),
  ),
)

/** The tuning slugs that have pages: the first segment of every board path. */
export const BOARD_TUNING_SLUGS = inventory.tunings.map(t => t.slug)

/** The board's path, with its trailing slash, or `null` when it has no page. */
export function boardPath(board: Board): string | null {
  const tuning = SLUG.tuning.get(board.tuningId)
  const root = SLUG.root.get(board.root)
  const type = SLUG[board.mode].get(board.typeId)
  if (!tuning || !root || !type) return null
  return `/${tuning}/${root}/${board.mode}/${type}/`
}

const PATH_RE = /^\/([a-z0-9-]+)\/([a-z0-9-]+)\/(chord|scale)\/([a-z0-9-]+)(?:\/(?:index\.html)?)?$/

/**
 * The board a path names, or `null`. Takes the path with or without its
 * trailing slash (Pages redirects one to the other) and as `…/index.html`,
 * since that is the file the build writes.
 */
export function boardFromPath(pathname: string): Board | null {
  const m = PATH_RE.exec(pathname)
  if (!m) return null
  const mode = m[3] as BoardKind
  const tuningId = ID.tuning.get(m[1]!)
  const root = ID.root.get(m[2]!)
  const typeId = ID[mode].get(m[4]!)
  if (!tuningId || !root || !typeId) return null
  return { tuningId, root, mode, typeId }
}
