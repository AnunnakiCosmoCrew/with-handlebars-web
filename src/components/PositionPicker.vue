<script setup lang="ts">
import { computed } from 'vue'
import type { Box } from '@anunnakicosmocrew/handlebars'
import type { ShapeLens } from '../lib/url-state.js'
import { useRoomStore } from '../stores/room.js'

const store = useRoomStore()

function caption(b: Box): string {
  return `Position ${b.index} · frets ${b.minFret}–${b.maxFret}`
}

const SHAPES: { id: ShapeLens; label: string; title: string; chordOnly?: boolean }[] = [
  { id: 'box', label: 'Box', title: 'A 5-fret rectangle where the hand sits' },
  {
    id: 'pattern',
    label: 'Pattern',
    title: 'The connected fingering shape walked from this position',
  },
  {
    id: 'diagonal',
    label: 'Diagonal',
    title: 'One octave per string pair — the climbing shape that bridges positions',
  },
  {
    id: 'run',
    label: 'Run',
    title: 'The classical full-range run: shift up the top string to the neck end',
  },
  {
    id: 'sweep',
    label: 'Sweep',
    title: 'The sweep-picking path: one tone per string through this arpeggio box',
    chordOnly: true,
  },
]
const shapes = computed(() => SHAPES.filter(s => !s.chordOnly || store.mode === 'chord'))
</script>

<template>
  <div class="position-picker" role="group" aria-label="Position">
    <span class="position-title">Position</span>
    <button
      type="button"
      class="position-btn"
      :class="{ 'position-btn-active': store.box === 0 }"
      :aria-pressed="store.box === 0"
      data-box="0"
      @click="store.setBox(0)"
    >
      All
    </button>
    <button
      v-for="b in store.boxes"
      :key="b.index"
      type="button"
      class="position-btn"
      :class="{ 'position-btn-active': store.box === b.index }"
      :aria-pressed="store.box === b.index"
      :data-box="b.index"
      :title="caption(b)"
      @click="store.setBox(b.index)"
    >
      {{ b.index }}
    </button>
    <span v-if="store.box !== 0" class="shape-toggle" role="group" aria-label="Shape">
      <button
        v-for="s in shapes"
        :key="s.id"
        type="button"
        class="position-btn shape-btn"
        :class="{ 'position-btn-active': store.shape === s.id }"
        :aria-pressed="store.shape === s.id"
        :data-shape="s.id"
        :title="s.title"
        @click="store.setShape(s.id)"
      >
        {{ s.label }}
      </button>
    </span>
  </div>
</template>

<style scoped>
.position-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.position-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hb-muted);
  margin-right: 0.3rem;
}

.position-btn {
  min-width: 2.1rem;
  padding: 0.3rem 0.5rem;
  font: inherit;
  background: var(--hb-control-bg);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  cursor: pointer;
}

.position-btn-active {
  background: var(--hb-active-bg);
  border-color: var(--hb-accent);
  color: var(--hb-accent);
}

.shape-toggle {
  display: inline-flex;
  gap: 0.3rem;
  margin-left: 0.6rem;
}
</style>
