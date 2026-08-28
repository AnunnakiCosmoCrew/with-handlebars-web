<script setup lang="ts">
import { computed } from 'vue'
import { formatDegree, formatNote } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../stores/room.js'

const store = useRoomStore()

// Chord label with display glyphs: format the root and the symbol tail
// separately so a double-sharp root never mangles the symbol. The roman
// numeral in front teaches how the chord sits in the key.
const options = computed(() =>
  store.overlayAnalysis.map(c => ({
    value: `${c.degreeIndex}-${c.typeId}`,
    text: `${formatDegree(c.numeral)} · ${formatNote(c.root)}${formatDegree(c.label.slice(c.root.length))}`,
  })),
)

function onChange(e: Event) {
  store.setOverlay((e.target as HTMLSelectElement).value)
}
</script>

<template>
  <label class="overlay-picker">
    <span class="overlay-title">Chord overlay</span>
    <select class="overlay-select" data-overlay :value="store.overlay" @change="onChange">
      <option value="">None</option>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.text }}</option>
    </select>
  </label>
</template>

<style scoped>
.overlay-picker {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.overlay-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hb-muted);
}

.overlay-select {
  padding: 0.3rem 0.4rem;
  font: inherit;
  background: var(--hb-control-bg);
  color: var(--hb-text);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  cursor: pointer;
}
</style>
