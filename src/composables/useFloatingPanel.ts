/**
 * The one place a floating panel's two touch problems are solved: staying
 * inside the window, and closing when you tap beside it (HB-83, UX-01…UX-04).
 *
 * Both answers share a lifetime — "while this panel is open" — so they share a
 * composable rather than a CSS utility plus a copy of the listener code at every
 * call site. Three panels use it: the Display popover, the ComboSelect dropdown
 * and the tuning dialog.
 *
 * Why a measured shift and not a CSS flip: CSS anchor positioning is far past
 * the iOS 15.0 floor (ADR-0003), and flipping which edge a panel is anchored to
 * does not actually fix the wide one — a 314 px dropdown right-aligned on a
 * trigger that ends near x = 300 still hangs off the left. A shift clamps any
 * box into the window and subsumes the flip case.
 *
 * Each panel spends `--hb-panel-shift` on its own inset (`left` on a left-anchored
 * panel, negated `right` on a right-anchored one) rather than on a transform. A
 * transform moves the pixels but leaves the original box in the document's
 * scrollable area, which is exactly the sideways page scroll UX-02 is about:
 * the panel would look clamped and the page would still drag 47 px left.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'

/**
 * Breathing room kept between a panel and the window edge, in px. The other half
 * of `--hb-panel-max-width`, which subtracts exactly two of these — the cap and
 * the clamp have to agree, or a panel sized to the cap could still be nudged
 * past the edge. Both are px for that reason; a rem cap would drift from this
 * constant with the root font size.
 */
export const PANEL_GUTTER = 16

/**
 * How far a panel has to move horizontally to sit inside the window.
 *
 * Pure, and the only arithmetic here — the geometry is worth testing without a
 * mount. `natural` is where CSS alone puts the panel, in viewport coordinates,
 * before any shift we applied.
 *
 * A zero width means "no layout": happy-dom hands every element a zeroed box,
 * and so does a panel in a `display: none` subtree. Answering 0 there keeps the
 * rendered result exactly what the stylesheet says, which is what every existing
 * test was written against.
 */
export function clampShift(
  natural: { left: number; width: number },
  viewportWidth: number,
  gutter: number = PANEL_GUTTER,
): number {
  if (natural.width <= 0 || viewportWidth <= 0) return 0
  const min = gutter
  const max = viewportWidth - gutter - natural.width
  // Wider than the gap it has to fit into — --hb-panel-max-width should have
  // prevented that, but if it did not, favour the left edge: the start of a
  // list is worth more than its end.
  if (max < min) return Math.round(min - natural.left)
  return Math.round(Math.min(max, Math.max(min, natural.left)) - natural.left)
}

export type FloatingPanel = {
  /** Bind to the panel element: carries the clamp as `--hb-panel-shift`. */
  panelStyle: ComputedRef<Record<string, string>>
  /** Bind to the root element's `@focusout`. */
  onFocusout: (e: FocusEvent) => void
  /** Re-measure by hand, for a call site whose panel changes width while open. */
  reposition: () => void
}

export function useFloatingPanel(options: {
  /** Whether the panel is on screen *and* floating — an inline host passes false. */
  open: MaybeRefOrGetter<boolean>
  /**
   * The wrapper holding **both the trigger and the panel**. That it contains the
   * trigger is load-bearing — see `onPointerdown`.
   */
  root: Ref<HTMLElement | undefined>
  /** The floating element itself. */
  panel: Ref<HTMLElement | undefined>
  /** Dismiss. Should not pull focus back to the trigger: on iOS that re-raises the keyboard. */
  close: () => void
}): FloatingPanel {
  const shift = ref(0)
  const isOpen = () => toValue(options.open)

  const panelStyle = computed(() => ({ '--hb-panel-shift': `${shift.value}px` }))

  function reposition() {
    const el = options.panel.value
    const root = options.root.value
    if (!isOpen() || !el || !root) return
    // Document coordinates, not viewport ones. By the time we measure, an
    // overflowing panel has often already made WebKit scroll the document
    // sideways — that scroll *is* UX-02 — and a rect read in that scrolled frame
    // clamps the panel into the window while leaving the document wider than it,
    // so the page stays shifted. Clamping where the panel actually sits in the
    // document removes the overflow, and the browser then drops the scroll it
    // no longer has room for.
    //
    // Minus our own shift, which is an inset and therefore part of the layout we
    // are reading back: subtracting it is what makes re-measuring idempotent.
    // The root is the offset parent (all three panels sit in a positioned wrapper).
    const natural = {
      left: root.getBoundingClientRect().left + window.scrollX + el.offsetLeft - shift.value,
      width: el.offsetWidth,
    }
    // clientWidth is the layout viewport 100vw is cut from — unaffected by the
    // sideways scroll above; innerWidth is the fallback for an environment that
    // lays nothing out.
    const viewport = document.documentElement.clientWidth || window.innerWidth || 0
    shift.value = clampShift(natural, viewport)
  }

  // Dismissal has to come from the pointer, not from focus alone. iOS does not
  // blur an input when you tap non-focusable space, so a focusout-only rule
  // leaves a picker with no way out but the keyboard's Done. And pressing a
  // radio's *label* blurs the button before the browser hands focus to the
  // input, so a focusout-only rule also tore the Display panel down mid-click
  // and swallowed the setting — the click never reached the input that was
  // already gone.
  //
  // The containment test is against `root`, which holds the trigger as well as
  // the panel. That is what defeats the close-then-reopen race: pointerdown
  // fires before click, so a trigger outside `root` would be closed here and
  // re-opened by the click that followed.
  function onPointerdown(e: Event) {
    if (isOpen() && !options.root.value?.contains(e.target as Node)) options.close()
  }

  // Focus leaving for somewhere else (tabbing away) still closes; focus going
  // nowhere in particular is the label case above, and is left to the pointer.
  function onFocusout(e: FocusEvent) {
    const next = e.relatedTarget as Node | null
    if (isOpen() && next && !options.root.value?.contains(next)) options.close()
  }

  const onViewportChange = () => {
    if (isOpen()) reposition()
  }

  watch(
    () => isOpen(),
    async open => {
      if (!open) {
        shift.value = 0
        return
      }
      // The panels are v-if'd, so the element exists only after the flush.
      await nextTick()
      reposition()
    },
    { flush: 'post' },
  )

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerdown)
    // Rotation resizes before it fires orientationchange in some WebKits, and
    // orientationchange is deprecated in others — listening to both costs
    // nothing, because the measurement is idempotent.
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('orientationchange', onViewportChange)
    if (isOpen()) void nextTick().then(reposition)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerdown)
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('orientationchange', onViewportChange)
  })

  return { panelStyle, onFocusout, reposition }
}
