<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { selectionMidiNotes } from '@anunnakicosmocrew/handlebars'
import {
  INSTRUMENTS,
  SPEED_MAX,
  SPEED_MIN,
  audioEngine,
  type InstrumentId,
} from '../audio/engine.js'
import { useRoomStore } from '../stores/room.js'
import ComboSelect from './ui/ComboSelect.vue'

const store = useRoomStore()

const status = ref<'idle' | 'loading' | 'playing' | 'error'>('idle')
let playingTimer: ReturnType<typeof setTimeout> | undefined

const instrumentOptions = INSTRUMENTS.map(i => ({ value: i.id, label: i.name }))

function setInstrument(v: string) {
  store.instrument = v as InstrumentId
}
const speedModel = computed({
  get: () => String(store.speed),
  set: v => {
    store.speed = Number(v)
  },
})

async function play() {
  // Re-entrance guard: a rapid second click can land before :disabled hits
  // the DOM and would start an overlapping engine.play().
  if (status.value === 'loading') return
  clearTimeout(playingTimer)
  status.value = 'loading'
  try {
    const seconds = await audioEngine.play(
      selectionMidiNotes(store.selection),
      store.instrument,
      store.speed,
    )
    status.value = 'playing'
    playingTimer = setTimeout(() => {
      if (status.value === 'playing') status.value = 'idle'
    }, seconds * 1000)
  } catch {
    status.value = 'error'
  }
}

function stop() {
  clearTimeout(playingTimer)
  audioEngine.stop()
  status.value = 'idle'
}

onBeforeUnmount(() => {
  clearTimeout(playingTimer)
  audioEngine.stop()
})
</script>

<template>
  <div class="playback">
    <button
      type="button"
      class="play-button"
      :disabled="status === 'loading'"
      :aria-label="
        status === 'playing' ? 'Stop' : status === 'loading' ? 'Loading instrument' : 'Play'
      "
      @click="status === 'playing' ? stop() : play()"
    >
      <template v-if="status === 'loading'">…</template>
      <template v-else-if="status === 'playing'">■ Stop</template>
      <template v-else>▶ Play</template>
    </button>
    <ComboSelect
      :model-value="store.instrument"
      :options="instrumentOptions"
      label="Instrument"
      @update:model-value="setInstrument"
    />
    <label class="speed">
      <span aria-hidden="true">🐌</span>
      <input
        v-model="speedModel"
        type="range"
        :min="SPEED_MIN"
        :max="SPEED_MAX"
        step="1"
        aria-label="Playback speed"
      />
      <span aria-hidden="true">🐇</span>
    </label>
    <span v-if="status === 'error'" class="playback-error" role="alert">
      Audio unavailable
    </span>
  </div>
</template>

<style scoped>
.playback {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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

.play-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.speed {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.speed input {
  width: 6.5rem;
  accent-color: var(--hb-accent);
}

.playback-error {
  color: var(--hb-altered);
  font-size: 0.85rem;
}
</style>
