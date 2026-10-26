/**
 * happy-dom answers media queries for a 1024px desktop with a mouse, which is
 * exactly the environment the touch fixes are not for. This stands `matchMedia`
 * in for a phone (or anything else) while a component mounts.
 */
export function withMatchMedia(matches: (query: string) => boolean, fn: () => void) {
  const real = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  try {
    fn()
  } finally {
    window.matchMedia = real
  }
}

/** A finger: `(pointer: coarse)` matches, everything else answers as it did. */
export const withCoarsePointer = (fn: () => void) =>
  withMatchMedia(q => q.includes('coarse'), fn)

/** A phone-width viewport: every `max-width` query matches. */
export const withNarrowViewport = (fn: () => void) =>
  withMatchMedia(q => q.includes('max-width'), fn)
