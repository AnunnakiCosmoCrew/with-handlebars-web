<script setup lang="ts">
import BrandMark from '../BrandMark.vue'

/**
 * The app icon at App Store size, drawn from the brand mark in the room's own
 * design tokens so the icon can never drift from the product. The plate reuses
 * OgCard's accent-wash idiom, which is what makes the icon and the social card
 * read as one family. Which theme it draws is the renderer's business: Chrome
 * is told what to prefer, and src/style.css does the rest.
 *
 * The plate is square and unrounded on purpose: iOS applies its own corner
 * mask, and a pre-rounded icon shows a dark seam inside it.
 *
 * The mark's size is the one thing that varies, because the two platforms crop
 * to different depths — see the .mark rule below. It is a prop rather than a
 * second component so the plate art can't fork.
 *
 * Render it with tools/render-icon.sh.
 */
withDefaults(defineProps<{ markSize?: number }>(), { markSize: 640 })
</script>

<template>
  <div class="plate" :style="{ '--hb-icon-mark': `${markSize}px` }">
    <BrandMark class="mark" />
  </div>
</template>

<style scoped>
.plate {
  box-sizing: border-box;
  width: 1024px;
  height: 1024px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(
      120% 95% at 62% 60%,
      color-mix(in srgb, var(--hb-accent) 26%, transparent),
      transparent 62%
    ),
    var(--hb-bg);
}

/* Set by the plate, defaulting to 640px — 62.5% of the square, where the mark
   stays inside the optical grid Apple's corner mask cuts into and still reads
   at Home Screen size. The manifest's maskable icon asks for 512 instead:
   Android's launcher masks guarantee only a centred circle 61% of the width,
   and at 640 the nut line's corners reach 326px from centre against the 313px
   that circle allows. At 512 they reach 261px. */
.mark {
  width: var(--hb-icon-mark);
  height: var(--hb-icon-mark);
}
</style>
