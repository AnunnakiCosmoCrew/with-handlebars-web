<script setup lang="ts">
import { computed } from 'vue'
import { CIRCLE_OF_FIFTHS, formatNote } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../stores/room.js'
import { useMediaQuery } from '../lib/media.js'
import { clefBaseline, clefSize } from './staff-geometry.js'

const store = useRoomStore()

// Wedge geometry: 12 segments of 30°, C at 12 o'clock, clockwise. The outer
// annulus holds the majors, the inner one their relative minors.
const SIZE = 470
const CX = SIZE / 2
const CY = SIZE / 2
const R_OUTER = 165
const R_MID = 112
const R_INNER = 62
const R_SIG = 202 // mini key-signature staffs, outside the wedges
const HALF = Math.PI / 12 // half a segment, 15°

// Key-signature accidental columns on a tiny treble staff. Vertical
// placement in half-gap steps below the top line (F5 = 0): the standard
// orders F♯ C♯ G♯ D♯ A♯ E♯ and B♭ E♭ A♭ D♭ G♭ C♭.
const SHARP_STEPS = [0, 3, -1, 2, 5, 1]
const FLAT_STEPS = [4, 1, 5, 2, 6, 3]
const STAFF_GAP = 4 // px between staff lines
// Same clef metrics as the big staff, at this staff's size: the spiral lands
// on the G line, one gap below centre.
const CLEF_SIZE = clefSize(STAFF_GAP)
const CLEF_Y = STAFF_GAP + clefBaseline(CLEF_SIZE)

function signatureAccidentals(sharps: number) {
  const steps = sharps > 0 ? SHARP_STEPS : FLAT_STEPS
  const glyph = sharps > 0 ? '♯' : '♭'
  return steps.slice(0, Math.abs(sharps)).map((step, i) => ({
    glyph,
    x: -8 + i * 6.5,
    y: -2 * STAFF_GAP + step * (STAFF_GAP / 2) + 3.5,
  }))
}

const angleOf = (index: number) => (index * Math.PI) / 6
const px = (r: number, a: number) => CX + r * Math.sin(a)
const py = (r: number, a: number) => CY - r * Math.cos(a)

/** An annulus sector between radii r0 < r1, centered on angle a. */
function wedgePath(r0: number, r1: number, a: number): string {
  const [a0, a1] = [a - HALF, a + HALF]
  return [
    `M ${px(r1, a0)} ${py(r1, a0)}`,
    `A ${r1} ${r1} 0 0 1 ${px(r1, a1)} ${py(r1, a1)}`,
    `L ${px(r0, a1)} ${py(r0, a1)}`,
    `A ${r0} ${r0} 0 0 0 ${px(r0, a0)} ${py(r0, a0)}`,
    'Z',
  ].join(' ')
}

const signature = (sharps: number) =>
  sharps > 0 ? `${sharps}♯` : sharps < 0 ? `${-sharps}♭` : ''

const segments = computed(() =>
  CIRCLE_OF_FIFTHS.map(k => {
    const a = angleOf(k.index)
    const active = store.circlePos.index === k.index
    const diatonic = store.circleDiatonic?.[k.index] ?? null
    return {
      index: k.index,
      // One hue per segment, around the wheel with the fifths — neighbor
      // keys get neighbor colors, the circle's own lesson in paint.
      hue: k.index * 30,
      majorPath: wedgePath(R_MID, R_OUTER, a),
      minorPath: wedgePath(R_INNER, R_MID, a),
      majorLabel: k.majorAlt
        ? `${formatNote(k.major)}/${formatNote(k.majorAlt)}`
        : formatNote(k.major),
      minorLabel: `${formatNote(k.minor)}m`,
      sig: signature(k.sharps),
      majorX: px((R_OUTER + R_MID) / 2 + 8, a),
      majorY: py((R_OUTER + R_MID) / 2 + 8, a),
      sigX: px(R_MID + 14, a),
      sigY: py(R_MID + 14, a),
      minorX: px((R_MID + R_INNER) / 2, a),
      minorY: py((R_MID + R_INNER) / 2, a),
      majorActive: active && store.circlePos.ring === 'major',
      minorActive: active && store.circlePos.ring === 'minor',
      majorDiatonic: diatonic?.major ?? false,
      minorDiatonic: diatonic?.minor ?? false,
      majorName: k.majorAlt
        ? `${formatNote(k.major)} or ${formatNote(k.majorAlt)} major`
        : `${formatNote(k.major)} major`,
      minorName: `${formatNote(k.minor)} minor`,
      sigStaffX: px(R_SIG, a),
      sigStaffY: py(R_SIG, a),
      accidentals: signatureAccidentals(k.sharps),
    }
  }),
)

/**
 * The wheel is `min(470px, 94vw)`, so 470 / 0.94 = 500 px of viewport is the
 * last width at which it draws full size; below that it shrinks with the
 * screen, and on a phone it lands near 380 px. That is where the mini staves
 * stop being information and become ink — their 4-unit line gaps render around
 * 3 px — so they go, and the viewBox tightens onto the wedges to spend the
 * width they were reserving, which is what enlarges the names (UX-10).
 */
const compact = useMediaQuery(`(max-width: ${Math.floor(SIZE / 0.94)}px)`)

// Radius the wedges occupy, plus a hair of margin, centred on the wheel.
const TIGHT_R = R_OUTER + 8
const viewBox = computed(() =>
  compact.value
    ? `${CX - TIGHT_R} ${CY - TIGHT_R} ${TIGHT_R * 2} ${TIGHT_R * 2}`
    : `0 0 ${SIZE} ${SIZE}`,
)

// The center names the key the selection sits on, on its ring.
const centerLabel = computed(() => {
  const key = CIRCLE_OF_FIFTHS[store.circlePos.index]
  if (!key) return ''
  return store.circlePos.ring === 'major'
    ? formatNote(key.major)
    : `${formatNote(key.minor)}m`
})
</script>

<template>
  <section v-if="store.circle === 'show'" class="circle-panel" aria-label="Circle of fifths">
    <svg
      class="circle-svg"
      :class="{ 'circle-compact': compact }"
      :viewBox="viewBox"
      role="group"
      aria-label="Circle of fifths — choose a key"
    >
      <g
        v-for="s in segments"
        :key="`maj-${s.index}`"
        class="cof-wedge"
        :class="{ 'cof-active': s.majorActive, 'cof-diatonic': s.majorDiatonic }"
        :style="{ '--cof-hue': s.hue }"
        role="button"
        tabindex="0"
        :aria-label="`${s.majorName}${s.sig ? ` — ${s.sig}` : ''}`"
        :aria-pressed="s.majorActive"
        :data-circle-major="s.index"
        @click="store.selectCircleKey(s.index, 'major')"
        @keydown.enter.prevent="store.selectCircleKey(s.index, 'major')"
        @keydown.space.prevent="store.selectCircleKey(s.index, 'major')"
      >
        <path :d="s.majorPath" />
        <text class="cof-major" :x="s.majorX" :y="s.majorY + 4">{{ s.majorLabel }}</text>
        <text v-if="s.sig" class="cof-sig" :x="s.sigX" :y="s.sigY + 3">{{ s.sig }}</text>
      </g>
      <g
        v-for="s in segments"
        :key="`min-${s.index}`"
        class="cof-wedge cof-wedge-minor"
        :class="{ 'cof-active': s.minorActive, 'cof-diatonic': s.minorDiatonic }"
        :style="{ '--cof-hue': s.hue }"
        role="button"
        tabindex="0"
        :aria-label="s.minorName"
        :aria-pressed="s.minorActive"
        :data-circle-minor="s.index"
        @click="store.selectCircleKey(s.index, 'minor')"
        @keydown.enter.prevent="store.selectCircleKey(s.index, 'minor')"
        @keydown.space.prevent="store.selectCircleKey(s.index, 'minor')"
      >
        <path :d="s.minorPath" />
        <text class="cof-minor" :x="s.minorX" :y="s.minorY + 3.5">{{ s.minorLabel }}</text>
      </g>
      <!-- notated key signatures on tiny treble staffs, outside the wedges —
           dropped on a phone, where they are too small to read (UX-10) -->
      <template v-if="!compact">
        <g
          v-for="s in segments"
          :key="`sig-${s.index}`"
          class="cof-signature"
          :data-circle-sig="s.index"
          :transform="`translate(${s.sigStaffX} ${s.sigStaffY})`"
          aria-hidden="true"
        >
          <line
            v-for="i in 5"
            :key="`sl-${i}`"
            class="cof-staff-line"
            :x1="-24"
            :x2="24"
            :y1="-2 * STAFF_GAP + (i - 1) * STAFF_GAP"
            :y2="-2 * STAFF_GAP + (i - 1) * STAFF_GAP"
          />
          <!-- anchored at the start, so x is the ink's left edge and the clef
               ends just clear of the accidental columns -->
          <text class="cof-clef" x="-21" :y="CLEF_Y" :font-size="CLEF_SIZE">𝄞</text>
          <text
            v-for="(acc, i) in s.accidentals"
            :key="`acc-${i}`"
            class="cof-acc"
            :x="acc.x"
            :y="acc.y"
          >
            {{ acc.glyph }}
          </text>
        </g>
      </template>
      <text class="cof-center" :x="CX" :y="CY + 5" data-circle-center>{{ centerLabel }}</text>
    </svg>
  </section>
</template>

<style scoped>
.circle-panel {
  display: flex;
  justify-content: center;
  margin: 1.25rem 0 0.25rem;
}

.circle-svg {
  width: min(470px, 94vw);
  height: auto;
  font-family: system-ui, sans-serif;
}

.cof-wedge {
  cursor: pointer;
}

/* Each segment wears its own hue (set inline as --cof-hue), pastel at rest,
   saturating as it becomes diatonic and fully as the active key; the minor
   ring runs the same hues a shade softer. Lightness comes from theme
   tokens so both palettes stay readable. */
.cof-wedge path {
  fill: hsl(calc(var(--cof-hue) * 1deg) 45% var(--hb-cof-base-l));
  stroke: var(--hb-border);
  stroke-width: 1;
}

.cof-wedge-minor path {
  fill: hsl(calc(var(--cof-hue) * 1deg) 30% var(--hb-cof-base-l));
}

.cof-wedge:hover path,
.cof-diatonic path {
  fill: hsl(calc(var(--cof-hue) * 1deg) 60% var(--hb-cof-lit-l));
}

.cof-wedge-minor:hover path,
.cof-wedge-minor.cof-diatonic path {
  fill: hsl(calc(var(--cof-hue) * 1deg) 45% var(--hb-cof-lit-l));
}

.cof-active path,
.cof-wedge-minor.cof-active path {
  fill: hsl(calc(var(--cof-hue) * 1deg) 65% var(--hb-cof-active-l));
}

.cof-wedge text {
  fill: var(--hb-text);
  text-anchor: middle;
  pointer-events: none;
}

.cof-major {
  font-size: 15px;
  font-weight: 600;
}

.cof-minor {
  font-size: 12px;
}

.cof-sig {
  font-size: 9.5px;
  fill: var(--hb-muted);
}

/* The tight viewBox already enlarges every glyph by about a third; the inner
   ring starts smallest and gets a little extra on top of that. */
.circle-compact .cof-minor {
  font-size: 13px;
}

.cof-active text {
  fill: var(--hb-accent-contrast);
}

.cof-active .cof-sig {
  fill: var(--hb-accent-contrast);
  opacity: 0.8;
}

.cof-wedge:focus-visible path {
  stroke: var(--hb-accent);
  stroke-width: 2.5;
}

.cof-center {
  font-size: 20px;
  font-weight: 700;
  fill: var(--hb-accent);
  text-anchor: middle;
}

.cof-staff-line {
  stroke: var(--hb-board-line);
  stroke-width: 0.7;
  opacity: 0.7;
}

.cof-clef {
  fill: var(--hb-text);
}

.cof-acc {
  font-size: 10px;
  fill: var(--hb-text);
  text-anchor: middle;
}
</style>
