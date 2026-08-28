<script setup lang="ts">
import { computed } from 'vue'
import { PRACTICE_TABS, type PracticeTab } from '../lib/url-state.js'
import { METERS, SUBDIVISIONS, TEMPO_MAX, TEMPO_MIN, meterOf } from '../audio/practice.js'
import { useRoomStore } from '../stores/room.js'
import { usePracticeStore } from '../stores/practice.js'
import QuizPractice from './QuizPractice.vue'
import PatternPractice from './PatternPractice.vue'
import ProgressionPractice from './ProgressionPractice.vue'

const store = useRoomStore()
const practice = usePracticeStore()

const TAB_LABELS: Record<Exclude<PracticeTab, 'off'>, string> = {
  quiz: 'Quiz',
  patterns: 'Patterns',
  progression: 'Progression',
}
const tabs = PRACTICE_TABS.filter((t): t is Exclude<PracticeTab, 'off'> => t !== 'off')

// Clicking the open tab closes the panel — the tabs are the whole switch.
function setTab(tab: Exclude<PracticeTab, 'off'>) {
  store.practice = store.practice === tab ? 'off' : tab
}

const SUB_LABELS: Record<number, { label: string; hint: string }> = {
  1: { label: '·', hint: 'Beats only' },
  2: { label: '2', hint: 'Eighth-note clicks between beats' },
  3: { label: '3', hint: 'Triplet clicks between beats' },
  4: { label: '4', hint: 'Sixteenth-note clicks between beats' },
}

// The visual pulse: one dot per beat of the bar, lit as it sounds (during
// the metronome AND the players' count-in bar), downbeats drawn heavier.
const beatDots = computed(() => {
  const meter = meterOf(store.meter)
  const live = practice.metronomeOn || practice.countingIn
  return Array.from({ length: meter.beats }, (_, i) => ({
    i,
    accent: meter.accents.includes(i),
    active: live && practice.metronomeBeat === i,
  }))
})
</script>

<template>
  <section class="practice" aria-label="Practice">
    <div class="practice-bar">
      <div class="practice-tabs" role="group" aria-label="Practice mode">
        <button
          v-for="tab in tabs"
          :key="tab"
          type="button"
          class="lens-btn"
          :class="{ 'lens-btn-active': store.practice === tab }"
          :aria-pressed="store.practice === tab"
          :data-practice-tab="tab"
          @click="setTab(tab)"
        >
          {{ TAB_LABELS[tab] }}
        </button>
      </div>
    </div>

    <template v-if="store.practice !== 'off'">
      <QuizPractice v-if="store.practice === 'quiz'" />
      <PatternPractice v-else-if="store.practice === 'patterns'" />
      <ProgressionPractice v-else-if="store.practice === 'progression'" />

      <div class="practice-audio">
        <fieldset class="audio-group">
          <legend>Beat</legend>
          <button
            type="button"
            class="lens-btn"
            :class="{ 'lens-btn-active': practice.metronomeOn }"
            :aria-pressed="practice.metronomeOn"
            data-metronome
            title="Click on every beat at the practice tempo"
            @click="practice.toggleMetronome()"
          >
            Click
          </button>
          <span class="beat-dots" aria-hidden="true">
            <span
              v-for="d in beatDots"
              :key="d.i"
              class="beat-dot"
              :class="{ 'beat-dot-accent': d.accent, 'beat-dot-active': d.active }"
              :data-beat-dot="d.i"
            />
          </span>
          <span class="audio-sep" />
          <span class="btn-row" role="group" aria-label="Meter">
            <button
              v-for="m in METERS"
              :key="m.id"
              type="button"
              class="lens-btn"
              :class="{ 'lens-btn-active': store.meter === m.id }"
              :aria-pressed="store.meter === m.id"
              :data-meter="m.id"
              :title="`${m.beats} beats to the bar`"
              @click="store.meter = m.id"
            >
              {{ m.id }}
            </button>
          </span>
          <span class="btn-row" role="group" aria-label="Click subdivision">
            <button
              v-for="s in SUBDIVISIONS"
              :key="s"
              type="button"
              class="lens-btn"
              :class="{ 'lens-btn-active': store.sub === s }"
              :aria-pressed="store.sub === s"
              :data-sub="s"
              :title="SUB_LABELS[s]!.hint"
              @click="store.sub = s"
            >
              {{ SUB_LABELS[s]!.label }}
            </button>
          </span>
          <span class="audio-sep" />
          <label class="practice-tempo">
            <input
              v-model.number="store.tempo"
              type="range"
              :min="TEMPO_MIN"
              :max="TEMPO_MAX"
              step="1"
              aria-label="Practice tempo"
            />
            <span class="practice-bpm">{{ store.tempo }} BPM</span>
          </label>
          <button
            type="button"
            class="lens-btn"
            data-tap-tempo
            title="Tap a few times to set the tempo"
            @click="practice.tapTempo()"
          >
            Tap
          </button>
        </fieldset>

        <fieldset class="audio-group">
          <legend>Drone</legend>
          <button
            type="button"
            class="lens-btn"
            :class="{ 'lens-btn-active': practice.droneOn }"
            :aria-pressed="practice.droneOn"
            data-drone
            title="Sustain the root underneath — hear every tone against home"
            @click="practice.toggleDrone()"
          >
            On
          </button>
          <button
            type="button"
            class="lens-btn"
            :class="{ 'lens-btn-active': store.droneMode === 'pulse' }"
            :aria-pressed="store.droneMode === 'pulse'"
            data-drone-mode
            title="Tanpura-style pulsing plucks instead of a steady sustain"
            @click="store.droneMode = store.droneMode === 'pulse' ? 'sustain' : 'pulse'"
          >
            Tanpura
          </button>
          <button
            type="button"
            class="lens-btn"
            :class="{ 'lens-btn-active': store.droneVoice === 'fifth' }"
            :aria-pressed="store.droneVoice === 'fifth'"
            data-drone-voice
            title="Add the fifth to the drone — the classic open-fifth pedal"
            @click="store.droneVoice = store.droneVoice === 'fifth' ? 'root' : 'fifth'"
          >
            +5th
          </button>
          <label class="drone-vol">
            <span aria-hidden="true">🔉</span>
            <input
              v-model.number="store.droneLevel"
              class="drone-level"
              type="range"
              min="0"
              max="100"
              step="1"
              aria-label="Drone volume"
              data-drone-level
            />
          </label>
        </fieldset>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* The card chrome (border, title, padding) comes from the CollapseCard
   wrapping this panel; only the internal layout lives here. */
.practice-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.practice-tabs {
  display: inline-flex;
  gap: 0.3rem;
}

.practice-audio {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.9rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--hb-border);
}

.audio-group {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  border: 1px solid var(--hb-border);
  border-radius: 8px;
  padding: 0.45rem 0.6rem 0.5rem;
  margin: 0;
}

.audio-group legend {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hb-muted);
  padding: 0 0.3rem;
}

.audio-sep {
  width: 1px;
  align-self: stretch;
  background: var(--hb-border);
  margin: 0 0.35rem;
}

.btn-row {
  display: inline-flex;
  gap: 0.3rem;
}

.beat-dots {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  margin: 0 0.2rem;
}

.beat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--hb-surface-2);
  border: 1px solid var(--hb-border);
  transition: transform 0.08s ease-out, background-color 0.08s ease-out;
}

.beat-dot-accent {
  width: 10px;
  height: 10px;
}

.beat-dot-active {
  background: var(--hb-accent);
  border-color: var(--hb-accent);
  transform: scale(1.35);
}

.lens-btn {
  min-width: 2.1rem;
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

.practice-tempo {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.practice-tempo input {
  width: 6.5rem;
  accent-color: var(--hb-accent);
}

.practice-bpm {
  font-size: 0.8rem;
  color: var(--hb-muted);
  font-variant-numeric: tabular-nums;
  min-width: 4.2rem;
}

.drone-vol {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.2rem;
}

.drone-level {
  width: 4.5rem;
  accent-color: var(--hb-accent);
}
</style>
