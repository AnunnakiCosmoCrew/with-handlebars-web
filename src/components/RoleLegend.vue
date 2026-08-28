<script setup lang="ts">
import { computed } from 'vue'
import type { ToneRole } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../stores/room.js'

const store = useRoomStore()

const ROLE_TEXT: Record<ToneRole, string> = {
  root: 'Root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
  extension: 'Extensions',
}

const entries = computed(() => store.presentRoles.map(r => ({ role: r, text: ROLE_TEXT[r] })))
</script>

<template>
  <ul v-if="store.roles === 'on'" class="role-legend" aria-label="Tone role colors">
    <li v-for="e in entries" :key="e.role" class="role-entry" :data-role="e.role">
      <span class="role-swatch" :class="`role-swatch-${e.role}`" aria-hidden="true" />
      {{ e.text }}
    </li>
    <li v-if="store.overlayChord" class="role-note">roles follow the overlay chord</li>
  </ul>
</template>

<style scoped>
.role-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 1rem;
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  font-size: 0.82rem;
  color: var(--hb-muted);
}

.role-entry {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.role-swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
}

.role-swatch-root {
  background: var(--hb-dot-root);
}

.role-swatch-third {
  background: var(--hb-role-third);
}

.role-swatch-fifth {
  background: var(--hb-role-fifth);
}

.role-swatch-seventh {
  background: var(--hb-role-seventh);
}

.role-swatch-extension {
  background: var(--hb-role-extension);
}

.role-note {
  font-style: italic;
}
</style>
