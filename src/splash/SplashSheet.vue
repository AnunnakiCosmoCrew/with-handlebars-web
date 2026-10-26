<script setup lang="ts">
import BrandMark from '../BrandMark.vue'

/**
 * The iOS launch screen's brand mark, drawn from the room's own design tokens
 * so the launch screen can never drift from the product. Which theme it draws
 * is the renderer's business: Chrome is told what to prefer, and src/style.css
 * does the rest.
 *
 * Unlike IconSheet there is no plate. The storyboard paints --hb-bg behind the
 * mark with an asset-catalogue colour set, and the web view's first paint is
 * that same token, so the launch hands over to the app with no seam anywhere
 * in it. A background here would be that seam: a 128pt square of very slightly
 * the wrong grey, which is exactly the kind of thing a flat field shows.
 *
 * Render it with tools/render-splash.sh.
 */
</script>

<template>
  <div class="tile">
    <BrandMark class="mark" />
  </div>
</template>

<style scoped>
.tile {
  box-sizing: border-box;
  width: 512px;
  height: 512px;
  display: grid;
  place-items: center;
  background: transparent;
}

/* The tile is the mark and nothing else: the 64-unit viewBox already carries
   its own margin, and the storyboard sizes the whole thing to 128pt. Padding
   here would shrink it twice. */
.mark {
  width: 512px;
  height: 512px;
}
</style>
