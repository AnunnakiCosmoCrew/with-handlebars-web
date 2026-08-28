<script setup lang="ts">
import { computed } from 'vue'
import { PROGRESSION_PRESETS, formatDegree, formatNote } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../stores/room.js'
import { usePracticeStore } from '../stores/practice.js'
import ComboSelect from './ui/ComboSelect.vue'

const store = useRoomStore()
const practice = usePracticeStore()

const presetOptions = PROGRESSION_PRESETS.map(p => ({ value: p.id, label: p.name }))

const FEELS: { id: 'block' | 'strum' | 'arpeggio'; label: string; hint: string }[] = [
  { id: 'block', label: 'Block', hint: 'One held chord per bar' },
  { id: 'strum', label: 'Strum', hint: 'The chord strummed on every beat' },
  { id: 'arpeggio', label: 'Arp', hint: 'Chord tones rolled one per beat' },
]

const running = computed(() => practice.playing === 'progression')

// The changes as a numeral strip — the running bar highlights.
const strip = computed(
  () =>
    store.progression?.map((s, i) => ({
      i,
      numeral: formatDegree(s.numeral),
      label: s.chord
        ? `${formatNote(s.chord.root)}${formatDegree(s.chord.label.slice(s.chord.root.length))}`
        : formatNote(s.root),
      active: running.value && practice.stepIndex === i,
    })) ?? null,
)
</script>

<template>
  <div class="progression">
    <p v-if="store.mode !== 'scale'" class="prog-note" data-prog-unavailable>
      Progressions harmonize a scale — switch to scale mode first.
    </p>
    <p v-else-if="store.progression === null" class="prog-note" data-prog-unavailable>
      Progressions need a 7-note scale — this one doesn&rsquo;t harmonize into diatonic
      chords.
    </p>
    <template v-else>
      <div class="prog-row">
        <ComboSelect
          :model-value="store.prog"
          :options="presetOptions"
          label="Progression"
          @update:model-value="store.prog = $event"
        />
        <button
          type="button"
          class="lens-btn"
          :class="{ 'lens-btn-active': store.sevenths === 'on' }"
          :aria-pressed="store.sevenths === 'on'"
          data-sevenths
          title="Harmonize four tones deep instead of three"
          @click="store.sevenths = store.sevenths === 'on' ? 'off' : 'on'"
        >
          7ths
        </button>
        <button
          type="button"
          class="lens-btn"
          :class="{ 'lens-btn-active': store.voicing === 'smooth' }"
          :aria-pressed="store.voicing === 'smooth'"
          data-voicing
          title="Voice each chord as the inversion nearest the one before, instead of all root position"
          @click="store.voicing = store.voicing === 'smooth' ? 'root' : 'smooth'"
        >
          Smooth
        </button>
        <span class="btn-row" role="group" aria-label="Bar feel">
          <button
            v-for="f in FEELS"
            :key="f.id"
            type="button"
            class="lens-btn"
            :class="{ 'lens-btn-active': store.feel === f.id }"
            :aria-pressed="store.feel === f.id"
            :data-feel="f.id"
            :title="f.hint"
            @click="store.feel = f.id"
          >
            {{ f.label }}
          </button>
        </span>
        <button
          type="button"
          class="lens-btn"
          :class="{ 'lens-btn-active': store.cycle === 'on' }"
          :aria-pressed="store.cycle === 'on'"
          data-cycle
          title="After each loop, move the whole progression a fifth around the circle"
          @click="store.cycle = store.cycle === 'on' ? 'off' : 'on'"
        >
          Cycle keys
        </button>
        <button
          type="button"
          class="play-button"
          data-prog-play
          :aria-label="running ? 'Stop the progression' : 'Loop the progression'"
          @click="running ? practice.stopPlayback() : practice.startProgression()"
        >
          <template v-if="running">■ Stop</template>
          <template v-else>▶ Loop</template>
        </button>
        <span v-if="running && practice.countingIn" class="prog-note" data-count-in>
          count-in…
        </span>
      </div>
      <ol class="prog-strip" data-prog-strip>
        <li
          v-for="bar in strip"
          :key="bar.i"
          class="prog-bar"
          :class="{ 'prog-bar-active': bar.active }"
          :data-prog-bar="bar.i"
        >
          <span class="prog-numeral">{{ bar.numeral }}</span>
          <span class="prog-chord">{{ bar.label }}</span>
        </li>
      </ol>
      <p class="prog-note">
        One bar per chord — the board rings each chord as it comes around{{
          store.cycle === 'on' ? ', moving up a fifth every loop' : ''
        }}.
      </p>
    </template>
  </div>
</template>

<style scoped>
.progression {
  margin-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.prog-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.btn-row {
  display: inline-flex;
  gap: 0.3rem;
}

.prog-strip {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
}

.prog-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 3.1rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  background: var(--hb-surface);
}

.prog-bar-active {
  border-color: var(--hb-accent);
  background: var(--hb-active-bg);
}

.prog-numeral {
  font-weight: 600;
  font-size: 0.95rem;
}

.prog-chord {
  font-size: 0.75rem;
  color: var(--hb-muted);
}

.prog-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--hb-muted);
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
