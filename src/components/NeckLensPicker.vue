<script setup lang="ts">
import { computed } from 'vue'
import { formatNote } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../stores/room.js'

const store = useRoomStore()

// Buttons run low string → high string, labeled by the tuning's letters.
const strings = computed(() =>
  store.tuning.letters.map((letter, i) => ({
    n: i + 1,
    letter: formatNote(letter),
  })),
)
</script>

<template>
  <div class="neck-lenses">
    <span class="lens-group" role="group" aria-label="String">
      <span class="lens-title">String</span>
      <button
        type="button"
        class="lens-btn"
        :class="{ 'lens-btn-active': store.soloStrings.length === 0 }"
        :aria-pressed="store.soloStrings.length === 0"
        data-solo-string="0"
        title="Show every string"
        @click="store.clearSoloStrings()"
      >
        All
      </button>
      <button
        v-for="s in strings"
        :key="s.n"
        type="button"
        class="lens-btn"
        :class="{ 'lens-btn-active': store.soloStrings.includes(s.n) }"
        :aria-pressed="store.soloStrings.includes(s.n)"
        :data-solo-string="s.n"
        :title="`Toggle the ${s.letter} string (${s.n}) — pick one or several to drill`"
        @click="store.toggleSoloString(s.n)"
      >
        {{ s.letter }}
      </button>
    </span>
    <button
      type="button"
      class="lens-btn octaves-btn"
      :class="{ 'lens-btn-active': store.octaves === 'on' }"
      :aria-pressed="store.octaves === 'on'"
      data-octaves
      title="Map the root's octave shapes across the neck"
      @click="store.setOctaves(store.octaves === 'on' ? 'off' : 'on')"
    >
      Octaves
    </button>
    <button
      type="button"
      class="lens-btn"
      :class="{ 'lens-btn-active': store.guides === 'on' }"
      :aria-pressed="store.guides === 'on'"
      :disabled="!store.hasGuideTones"
      data-guides
      title="Highlight the 3rds and 7ths — the guide tones that define the sound"
      @click="store.setGuides(store.guides === 'on' ? 'off' : 'on')"
    >
      Guides
    </button>
  </div>
</template>

<style scoped>
.neck-lenses {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.lens-group {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.lens-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hb-muted);
  margin-right: 0.3rem;
}

.lens-btn {
  min-width: var(--hb-chip-min);
  padding: 0.3rem 0.5rem;
  font: inherit;
  background: var(--hb-control-bg);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  cursor: pointer;
}

.lens-btn-active {
  background: var(--hb-active-bg);
  border-color: var(--hb-accent);
  color: var(--hb-accent);
}

.lens-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.octaves-btn {
  margin-left: 0.6rem;
}
</style>
