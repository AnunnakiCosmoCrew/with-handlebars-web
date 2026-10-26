<script setup lang="ts">
/**
 * The brand mark: a fragment of a fretboard — the nut, one string, a root dot
 * and a tone dot. This file is the geometry's one source of truth. It draws in
 * design tokens and carries no size, so every consumer sizes it with its own
 * class (Vue applies a parent's scoped CSS to a child's root node):
 *
 *   src/App.vue                 .brand-mark, 26px in the room header
 *   src/og/OgCard.vue           .mark, 58px on the social card
 *   src/icon/IconSheet.vue      .mark, 640px on the app-icon plate
 *   src/splash/SplashSheet.vue  .mark, 512px on the launch-screen tile
 *
 * Two copies live outside Vue's reach and are kept in step by hand:
 * `about.html` (a static page authored by hand — ADR-0001) and
 * `public/favicon.svg` (a standalone file, so literal hexes rather than tokens).
 */
</script>

<template>
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <line x1="4" y1="32" x2="60" y2="32" stroke="var(--hb-board-line)" stroke-width="4" />
    <line x1="11" y1="10" x2="11" y2="54" stroke="var(--hb-board-line)" stroke-width="6" />
    <circle cx="30" cy="32" r="11" fill="var(--hb-accent)" />
    <circle cx="50" cy="32" r="7.5" fill="var(--hb-dot-tone)" />
  </svg>
</template>
