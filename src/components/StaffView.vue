<script setup lang="ts">
import { computed } from 'vue'
import type {
  IdentifiedPitch,
  SelectionPitch,
  ToneRole,
  Tuning,
} from '@anunnakicosmocrew/handlebars'
import { formatNote } from '@anunnakicosmocrew/handlebars'
import {
  LINE_INDICES,
  accidentalGlyph,
  clefBaseline,
  clefSize,
  clefTail,
  ledgerLines,
  writtenIndex,
} from './staff-geometry.js'

export type StaffGhost = IdentifiedPitch & { string: number; fret: number }

const props = withDefaults(
  defineProps<{
    pitches: SelectionPitch[]
    tuning: Tuning
    /** Sounding midi of the pinned pitch, if any. */
    focused?: number | null
    ghost?: StaffGhost | null
    /** Sounding midi → harmonic role; noteheads in the map get role-tinted. */
    roles?: Map<number, ToneRole> | null
  }>(),
  { focused: null, ghost: null, roles: null },
)

const emit = defineEmits<{
  select: [midi: number]
}>()

const STEP = 6.5
const PAD = 14
const NOTE_X0 = 104
const CLEF_SIZE = clefSize(STEP * 2) // STEP is a half-space
const CLEF_DY = clefBaseline(CLEF_SIZE)
const CLEF_TAIL = clefTail(CLEF_SIZE)
const NOTE_DX = 66
const GHOST_DX = 44

const soundingLabel = (p: { name: string; octave: number }) =>
  `${formatNote(p.name)}${p.octave}`
const writtenLabel = (p: { name: string; octave: number }) =>
  `${formatNote(p.name)}${p.octave + 1}`

const notes = computed(() =>
  props.pitches.map((p, i) => {
    const role = props.roles?.get(p.midi) ?? null
    return {
      midi: p.midi,
      isRoot: p.isRoot,
      positions: p.positions,
      idx: writtenIndex(p.letter, p.octave),
      x: NOTE_X0 + i * NOTE_DX,
      glyph: accidentalGlyph(p.accidental),
      sounding: soundingLabel(p),
      written: writtenLabel(p),
      role,
      roleCls: role ? `st-note-role-${role}` : null,
    }
  }),
)

const ghostNote = computed(() =>
  props.ghost
    ? {
        idx: writtenIndex(props.ghost.letter, props.ghost.octave),
        x: NOTE_X0 + props.pitches.length * NOTE_DX + GHOST_DX,
        glyph: accidentalGlyph(props.ghost.accidental),
        sounding: soundingLabel(props.ghost),
      }
    : null,
)

// The drawing origin adapts to the pitch range so high necks (24 frets) get
// ledger-line headroom without reserving it for every selection.
const allIdx = computed(() => [
  ...notes.value.map(n => n.idx),
  ...(ghostNote.value ? [ghostNote.value.idx] : []),
])
const maxIdx = computed(() => Math.max(40, ...allIdx.value))
const minIdx = computed(() => Math.min(28, ...allIdx.value))
const e4Y = computed(() => PAD + (maxIdx.value - 30) * STEP + 6)
const yOf = (idx: number) => e4Y.value - (idx - 30) * STEP
const labelY = computed(() => yOf(minIdx.value) + 26)
const height = computed(() => labelY.value + 12)
const width = computed(() => NOTE_X0 + props.pitches.length * NOTE_DX + GHOST_DX + 42)

const stringName = (index: number) =>
  `string ${props.tuning.strings.length - index} (${formatNote(props.tuning.letters[index] ?? '')})`

const caption = computed(() => {
  if (props.ghost) {
    const g = props.ghost
    const where = `${stringName(g.string)}, fret ${g.fret}`
    const membership = g.inSelection ? '' : ' — not in the selection'
    return `${where} · sounds ${soundingLabel(g)}${membership}`
  }
  if (props.focused !== null) {
    const n = notes.value.find(x => x.midi === props.focused)
    if (n) {
      const spots = n.positions.map(p => `${stringName(p.string)} fret ${p.fret}`)
      return `Written ${n.written} · sounds ${n.sounding} — ${spots.length} position${
        spots.length > 1 ? 's' : ''
      }: ${spots.join(' · ')}`
    }
  }
  return 'Click a note — or any spot on the board — to pin a pitch.'
})
</script>

<template>
  <div class="staff-view">
    <svg
      class="staff"
      :class="{ 'staff-dimmed': focused !== null }"
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      role="group"
      aria-label="Notation"
    >
      <line
        v-for="idx in LINE_INDICES"
        :key="`line-${idx}`"
        class="st-line"
        :x1="PAD"
        :x2="width - 8"
        :y1="yOf(idx)"
        :y2="yOf(idx)"
      />
      <!-- treble clef, spiral centred on the G line; the 8 says the guitar
           sounds an octave below what's written -->
      <text class="st-clef" :x="PAD + 6" :y="yOf(32) + CLEF_DY" :font-size="CLEF_SIZE">𝄞</text>
      <text
        class="st-clef"
        :x="PAD + 27"
        :y="yOf(32) + CLEF_TAIL + 11"
        font-size="12"
        text-anchor="middle"
      >
        8
      </text>

      <g
        v-for="n in notes"
        :key="n.midi"
        class="st-note"
        :class="[n.roleCls, { 'st-note-root': !roles && n.isRoot, 'st-note-focused': n.midi === focused }]"
        role="button"
        tabindex="0"
        :aria-label="`${n.sounding}, ${n.positions.length} positions`"
        :data-midi="n.midi"
        :data-role="n.role || undefined"
        @click="emit('select', n.midi)"
        @keydown.enter.prevent="emit('select', n.midi)"
        @keydown.space.prevent="emit('select', n.midi)"
      >
        <line
          v-for="p in ledgerLines(n.idx)"
          :key="`lg-${p}`"
          class="st-ledger"
          :x1="n.x - 12"
          :x2="n.x + 12"
          :y1="yOf(p)"
          :y2="yOf(p)"
        />
        <text v-if="n.glyph" class="st-acc" :x="n.x - 22" :y="yOf(n.idx) + 5">
          {{ n.glyph }}
        </text>
        <ellipse
          :cx="n.x"
          :cy="yOf(n.idx)"
          rx="8"
          ry="6"
          :transform="`rotate(-18 ${n.x} ${yOf(n.idx)})`"
        />
        <text class="st-pname" :x="n.x" :y="labelY">{{ n.sounding }}</text>
      </g>

      <g v-if="ghostNote" class="st-ghost">
        <line
          v-for="p in ledgerLines(ghostNote.idx)"
          :key="`glg-${p}`"
          class="st-ledger"
          :x1="ghostNote.x - 12"
          :x2="ghostNote.x + 12"
          :y1="yOf(p)"
          :y2="yOf(p)"
        />
        <text v-if="ghostNote.glyph" class="st-acc" :x="ghostNote.x - 22" :y="yOf(ghostNote.idx) + 5">
          {{ ghostNote.glyph }}
        </text>
        <ellipse
          :cx="ghostNote.x"
          :cy="yOf(ghostNote.idx)"
          rx="8"
          ry="6"
          :transform="`rotate(-18 ${ghostNote.x} ${yOf(ghostNote.idx)})`"
        />
        <text class="st-pname" :x="ghostNote.x" :y="labelY">{{ ghostNote.sounding }}</text>
      </g>
    </svg>
    <p class="staff-caption" aria-live="polite">{{ caption }}</p>
  </div>
</template>

<style scoped>
.staff {
  display: block;
  font-family: system-ui, sans-serif;
}

.st-line,
.st-ledger {
  stroke: var(--hb-board-line);
  stroke-width: 1.2;
}

.st-clef {
  fill: var(--hb-board-line);
}

.st-note {
  cursor: pointer;
}

.st-note ellipse {
  fill: var(--hb-dot-tone);
}

.st-note-root ellipse {
  fill: var(--hb-dot-root);
}

/* Tone-role tints, matching the fretboard's — after the base fills so they
   win the cascade. With a roles map the map owns ALL tinting (isRoot-based
   coloring is suppressed above), so an out-of-frame pitch stays neutral and
   the frame's own root — even an overlay chord's — tints as root. */
.st-note-role-root ellipse {
  fill: var(--hb-dot-root);
}

.st-note-role-third ellipse {
  fill: var(--hb-role-third);
}

.st-note-role-fifth ellipse {
  fill: var(--hb-role-fifth);
}

.st-note-role-seventh ellipse {
  fill: var(--hb-role-seventh);
}

.st-note-role-extension ellipse {
  fill: var(--hb-role-extension);
}

.st-acc {
  fill: var(--hb-text);
  font-size: 15px;
}

.st-pname {
  fill: var(--hb-muted);
  font-size: 10px;
  text-anchor: middle;
}

.st-note-focused ellipse {
  stroke: var(--hb-accent);
  stroke-width: 2.5;
}

.st-note-focused .st-pname {
  fill: var(--hb-accent);
  font-weight: 700;
}

.st-note:focus-visible ellipse {
  stroke: var(--hb-accent);
  stroke-width: 2.5;
}

.staff-dimmed .st-note:not(.st-note-focused) {
  opacity: 0.35;
}

.st-ghost ellipse {
  fill: none;
  stroke: var(--hb-muted);
  stroke-width: 1.6;
  stroke-dasharray: 3 2.5;
}

.st-ghost .st-acc,
.st-ghost .st-pname {
  fill: var(--hb-muted);
}

.st-ghost .st-pname {
  font-style: italic;
}

.staff-caption {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--hb-muted);
}
</style>
