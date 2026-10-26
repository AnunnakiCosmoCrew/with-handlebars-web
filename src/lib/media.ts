/**
 * Reactive `matchMedia`, for the handful of places where a media query has to
 * reach JavaScript rather than CSS: SVG geometry is computed in script, so a
 * board that wants taller string rows under a finger cannot ask a stylesheet.
 *
 * CSS stays the default. Reach for this only when the answer changes numbers
 * the markup carries — a viewBox, a coordinate — not colours or spacing.
 */
import { onScopeDispose, readonly, ref, type Ref } from 'vue'

/** Fingers, not a mouse: iOS, Android, and a touch laptop's touchscreen. */
export const COARSE_POINTER = '(pointer: coarse)'

/**
 * True while `query` matches, updating as it changes — an iPad that gains a
 * trackpad switches pointer type mid-session, and the simulator's rotation
 * changes width under a mounted component.
 *
 * Answers `false` without a `window` (the build's prerender step) or without
 * `matchMedia`, so the desktop geometry is what a non-browser sees.
 */
export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const list = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined
  const matches = ref(list?.matches ?? false)
  if (list?.addEventListener) {
    const onChange = (e: MediaQueryListEvent) => {
      matches.value = e.matches
    }
    list.addEventListener('change', onChange)
    onScopeDispose(() => list.removeEventListener('change', onChange))
  }
  return readonly(matches)
}
