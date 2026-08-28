<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { audioEngine } from './audio/engine.js'
import { boardWidth } from './components/fretboard-geometry.js'
import { STORAGE_KEY, useRoomStore } from './stores/room.js'
import { usePracticeStore } from './stores/practice.js'
import Fretboard from './components/Fretboard.vue'
import StaffView from './components/StaffView.vue'
import ModeToggle from './components/ModeToggle.vue'
import RootPicker from './components/RootPicker.vue'
import TypePicker from './components/TypePicker.vue'
import TuningPicker from './components/TuningPicker.vue'
import DisplayOptions from './components/DisplayOptions.vue'
import PositionPicker from './components/PositionPicker.vue'
import NeckLensPicker from './components/NeckLensPicker.vue'
import OverlayPicker from './components/OverlayPicker.vue'
import RoleLegend from './components/RoleLegend.vue'
import CircleOfFifths from './components/CircleOfFifths.vue'
import InfoPanel from './components/InfoPanel.vue'
import AnatomyPanel from './components/AnatomyPanel.vue'
import PlaybackControls from './components/PlaybackControls.vue'
import PracticePanel from './components/PracticePanel.vue'
import CollapseCard from './components/CollapseCard.vue'

const store = useRoomStore()
const practice = usePracticeStore()

// Keep dot size readable at higher fret counts: grow the board's minimum
// width with the neck instead of letting the SVG shrink to fit, so long
// boards scroll horizontally rather than scaling down. 640px is the rendered
// minimum for the 12-fret baseline; longer necks keep that same scale.
const BOARD_MIN_SCALE = 640 / boardWidth(12)
const boardMinWidth = computed(
  () => `${Math.round(boardWidth(store.fretCount) * BOARD_MIN_SCALE)}px`,
)

// Pinning a pitch (staff note or board dot) or identifying a cell also plays
// it — the click is the user gesture the AudioContext needs.
function playPitch(midi: number) {
  audioEngine.play({ midi: [midi], kind: 'strum' }, store.instrument, store.speed).catch(() => {
    /* audio unavailable — the visual selection still works */
  })
}

function onSelectPitch(midi: number) {
  store.focusPitch(midi)
  if (store.focusedPitch !== null) playPitch(midi)
}

function onCell(stringIndex: number, fret: number) {
  // During a quiz question the board is the answer sheet, not the inspector.
  if (practice.answerCell(stringIndex, fret)) return
  store.identifyCell(stringIndex, fret)
  if (store.ghost) playPitch(store.ghost.midi)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') store.clearPitchFocus()
}

// The brand is the way home: drop the remembered room so the plain "/" the
// link points at loads the fresh default. The stateful URL stays one
// back-button press away. Only a plain click means "leave this room" — a
// modified one opens a second tab and leaves this one where it is, so the
// remembered room has to survive it.
function goHome(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  localStorage.removeItem(STORAGE_KEY)
}

// Folding the practice card closes practice outright — nothing may keep
// sounding or quizzing with its controls hidden. (Setting practice to 'off'
// trips the practice store's shutdown watcher.)
function togglePracticeCard() {
  const closing = store.practiceCard === 'show'
  store.practiceCard = closing ? 'hide' : 'show'
  if (closing) store.practice = 'off'
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="page">
    <main class="room">
      <header class="room-header">
        <a class="brand" href="/" title="Back to the fresh room" @click="goHome">
          <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <line x1="4" y1="32" x2="60" y2="32" stroke="var(--hb-board-line)" stroke-width="4" />
            <line x1="11" y1="10" x2="11" y2="54" stroke="var(--hb-board-line)" stroke-width="6" />
            <circle cx="30" cy="32" r="11" fill="var(--hb-accent)" />
            <circle cx="50" cy="32" r="7.5" fill="var(--hb-dot-tone)" />
          </svg>
          <div class="brand-text">
            <h1>With Handlebars</h1>
            <span class="brand-tag">guitar scales &amp; chords</span>
          </div>
        </a>
        <TuningPicker
          :model-value="store.tuningId"
          :tuning="store.tuning"
          :is-custom="store.isCustomTuning"
          @update:model-value="store.setTuning($event)"
        />
      </header>

      <div class="room-controls">
        <ModeToggle v-model="store.mode" />
        <RootPicker v-model="store.root" />
        <TypePicker
          v-if="store.mode === 'chord'"
          v-model="store.chordId"
          mode="chord"
          :root="store.root"
        />
        <TypePicker v-else v-model="store.scaleId" mode="scale" :root="store.root" />
        <span class="spacer" />
        <DisplayOptions />
      </div>

      <div class="room-positions">
        <PositionPicker />
        <NeckLensPicker />
        <OverlayPicker v-if="store.mode === 'scale'" />
      </div>

      <div class="board-scroll" :style="{ '--board-min-width': boardMinWidth }">
        <Fretboard
          :tuning="store.tuning"
          :dots="store.dots"
          :label-mode="store.labelMode"
          :handedness="store.handedness"
          :string-order="store.stringOrder"
          :offsets="store.fullOffsets"
          :fret-count="store.fretCount"
          :focused-midi="practice.liveMidi ?? store.focusedPitch"
          :ghost="store.ghost"
          :box="store.outlinedBox"
          :shape-keys="practice.boardKeys ?? store.lensKeys"
          :hide-labels="practice.hideLabels"
          :marks="practice.boardMarks"
          :passive-dots="practice.passiveDots"
          :overlay-keys="store.overlayKeys"
          :links="store.octaveLinks"
          :roles="store.dotRoles"
          @tune="store.tune"
          @select-pitch="onSelectPitch"
          @cell="onCell"
        />
      </div>

      <RoleLegend />

      <CollapseCard
        title="Notation"
        :open="store.staff === 'show'"
        @toggle="store.staff = store.staff === 'show' ? 'hide' : 'show'"
      >
        <div class="staff-scroll">
          <StaffView
            :pitches="store.staffPitches"
            :tuning="store.tuning"
            :focused="store.focusedPitch"
            :ghost="store.ghost"
            :roles="store.pitchRoles"
            @select="onSelectPitch"
          />
        </div>
      </CollapseCard>

      <div class="room-playback">
        <PlaybackControls />
      </div>

      <CollapseCard
        title="Circle of fifths"
        :open="store.circle === 'show'"
        @toggle="store.circle = store.circle === 'show' ? 'hide' : 'show'"
      >
        <CircleOfFifths />
      </CollapseCard>

      <CollapseCard title="Practice" :open="store.practiceCard === 'show'" @toggle="togglePracticeCard()">
        <PracticePanel />
      </CollapseCard>

      <CollapseCard
        title="Details"
        :open="store.infoCard === 'show'"
        @toggle="store.infoCard = store.infoCard === 'show' ? 'hide' : 'show'"
      >
        <InfoPanel :info="store.info" :mode="store.mode" />
      </CollapseCard>

      <CollapseCard
        title="How it's built"
        :open="store.anatomyCard === 'show'"
        @toggle="store.anatomyCard = store.anatomyCard === 'show' ? 'hide' : 'show'"
      >
        <AnatomyPanel />
      </CollapseCard>
    </main>

    <footer class="site-footer">
      <p>
        Every chord and scale tone, across the whole guitar neck, in any tuning — with
        your own spelling rules.
      </p>
      <p class="site-footer-fine">
        <a href="/about">About</a> · an
        <a href="https://anunnakicosmocrew.github.io/" rel="noopener">Anunnaki Cosmo Crew</a>
        project ·
        <a href="mailto:contact@cosmocrew.dev">contact@cosmocrew.dev</a>
      </p>
      <p class="site-footer-fine">
        Guitar samples from the MusyngKite soundfont via
        <a href="https://github.com/gleitz/midi-js-soundfonts" rel="noopener">midi-js-soundfonts</a>
        (MIT).
      </p>
    </footer>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.room {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 1.5rem 1rem 0;
  flex: 1;
}

.room-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: inherit;
  text-decoration: none;
  border-radius: 8px;
}

.brand:hover h1 {
  color: var(--hb-accent);
}

.brand-mark {
  width: 26px;
  height: 26px;
  flex: none;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand h1 {
  font-size: 1.35rem;
  letter-spacing: -0.01em;
  line-height: 1.15;
  margin: 0;
}

/* The one place above the fold that says what instrument this is for. */
.brand-tag {
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  color: var(--hb-muted);
}

.room-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
}

.spacer {
  flex: 1;
}

.room-positions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1.2rem;
  margin: -0.65rem 0 0.9rem;
}

.board-scroll {
  overflow-x: auto;
  margin-inline: -1rem;
  padding-inline: 1rem;
}

.board-scroll :deep(.fretboard) {
  min-width: var(--board-min-width, 640px);
}

.staff-scroll {
  overflow-x: auto;
  margin: 1rem -1rem 0;
  padding-inline: 1rem;
}

.room-playback {
  margin: 1rem 0 1.25rem;
}

.site-footer {
  margin-top: 2.5rem;
  padding: 1.1rem 1rem 1.4rem;
  border-top: 1px solid var(--hb-border);
  text-align: center;
  color: var(--hb-muted);
  font-size: 0.85rem;
}

.site-footer p {
  margin: 0.25rem 0;
}

.site-footer-fine {
  font-size: 0.78rem;
}

.site-footer a {
  color: inherit;
}

@media (max-width: 640px) {
  .room-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
  }
}
</style>
