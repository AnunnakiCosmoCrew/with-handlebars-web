<script setup lang="ts">
import { computed } from 'vue'
import type { SequencePatternId } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../stores/room.js'
import { usePracticeStore } from '../stores/practice.js'

const store = useRoomStore()
const practice = usePracticeStore()

// The classic workout menu, in pedagogical order.
const PATTERNS: { id: SequencePatternId; label: string; hint: string }[] = [
  { id: 'asc', label: 'Up', hint: 'Straight ascending run' },
  { id: 'desc', label: 'Down', hint: 'Straight descending run' },
  { id: 'updown', label: 'Up & down', hint: 'To the top and back without repeating the peak' },
  { id: 'thirds', label: '3rds', hint: 'Skip pattern: 1-3, 2-4, 3-5…' },
  { id: 'fourths', label: '4ths', hint: 'Skip pattern: 1-4, 2-5, 3-6…' },
  { id: 'groups3', label: 'Groups of 3', hint: 'Sliding windows: 1-2-3, 2-3-4…' },
  { id: 'groups4', label: 'Groups of 4', hint: 'Sliding windows: 1-2-3-4, 2-3-4-5…' },
]

const running = computed(() => practice.playing === 'pattern')

// In scale mode the run can come from the scale itself or from the overlay
// chord's arpeggio; a chord selection simply is its arpeggio.
const arpActive = computed(() => store.mode === 'scale' && store.arp === 'on')
const arpChordLabel = computed(() => store.overlayChord?.label ?? null)

const poolLine = computed(() => {
  const n = store.practicePool.length
  if (store.mode === 'chord') return `${n} notes over the arpeggio, one per beat`
  if (arpActive.value && arpChordLabel.value)
    return `${n} notes over the ${arpChordLabel.value} arpeggio, one per beat`
  const what = store.activeBox ? 'position' : 'scale run'
  return `${n} notes over the ${what}, one per beat`
})
</script>

<template>
  <div class="patterns">
    <div class="pattern-row" role="group" aria-label="Run source">
      <template v-if="store.mode === 'chord'">
        <span class="lens-btn lens-btn-active source-chip" data-run-source="arpeggio">
          Arpeggio
        </span>
        <span class="pattern-note">a chord is its arpeggio — the run climbs its tones</span>
      </template>
      <button
        v-if="store.mode === 'scale'"
        type="button"
        class="lens-btn"
        :class="{ 'lens-btn-active': !arpActive }"
        :aria-pressed="!arpActive"
        data-run-source="scale"
        title="Sequence the scale itself"
        @click="store.arp = 'off'"
      >
        Scale run
      </button>
      <button
        v-if="store.mode === 'scale'"
        type="button"
        class="lens-btn"
        :class="{ 'lens-btn-active': arpActive }"
        :aria-pressed="arpActive"
        data-run-source="arpeggio"
        title="Sequence the overlay chord's arpeggio instead"
        @click="store.arp = 'on'"
      >
        Arpeggio
      </button>
      <span v-if="arpActive && !arpChordLabel" class="pattern-note" data-arp-hint>
        pick a chord in the Chord overlay to arpeggiate — running the scale meanwhile
      </span>
    </div>
    <div class="pattern-row" role="group" aria-label="Pattern">
      <button
        v-for="p in PATTERNS"
        :key="p.id"
        type="button"
        class="lens-btn"
        :class="{ 'lens-btn-active': store.pattern === p.id }"
        :aria-pressed="store.pattern === p.id"
        :data-pattern="p.id"
        :title="p.hint"
        @click="store.pattern = p.id"
      >
        {{ p.label }}
      </button>
    </div>
    <div class="pattern-row">
      <button
        type="button"
        class="play-button"
        data-pattern-play
        :aria-label="running ? 'Stop the pattern' : 'Play the pattern'"
        @click="running ? practice.stopPlayback() : practice.startPattern()"
      >
        <template v-if="running">■ Stop</template>
        <template v-else>▶ Play</template>
      </button>
      <span v-if="running && practice.countingIn" class="pattern-note" data-count-in>
        count-in…
      </span>
      <span class="pattern-note" data-pattern-pool>{{ poolLine }}</span>
    </div>
  </div>
</template>

<style scoped>
.patterns {
  margin-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.pattern-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.pattern-note {
  font-size: 0.8rem;
  color: var(--hb-muted);
  margin-left: 0.4rem;
}

.lens-btn {
  padding: 0.3rem 0.6rem;
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

/* The chord-mode source is a statement, not a choice. */
.source-chip {
  cursor: default;
}

.play-button {
  padding: 0.4rem 0.9rem;
  font: inherit;
  background: var(--hb-accent);
  color: var(--hb-accent-contrast);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  min-width: 5.2rem;
}
</style>
