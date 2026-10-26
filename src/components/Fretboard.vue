<script setup lang="ts">
import { computed } from 'vue'
import type { Box, FretDot, OctaveLink, ToneRole, Tuning } from '@anunnakicosmocrew/handlebars'
import { dotInBox, formatDegree, formatNote } from '@anunnakicosmocrew/handlebars'
import {
  GEOM,
  boardHeight,
  boardWidth,
  boxSpanX,
  dotX,
  fretWireX,
  markerFrets,
  mirrorX,
  numberedFrets,
  nutX,
  stringY,
  type Handedness,
  type StringOrder,
} from './fretboard-geometry.js'
import { COARSE_POINTER, useMediaQuery } from '../lib/media.js'

const props = withDefaults(
  defineProps<{
    tuning: Tuning
    dots: FretDot[]
    labelMode?: 'names' | 'intervals'
    handedness?: Handedness
    stringOrder?: StringOrder
    /** Per-string semitone offsets from the selected preset; non-zero renders red. */
    offsets?: number[]
    fretCount?: number
    /** Sounding midi of the pinned pitch — its dots ring, the rest dim. */
    focusedMidi?: number | null
    /** An identified empty position, rendered as a dashed ghost dot. */
    ghost?: { string: number; fret: number; name: string } | null
    /** Active position box — it outlines, dots outside it dim. */
    box?: Box | null
    /**
     * "string:fret" keys of a connected fingering pattern — dots outside it
     * dim, no rectangle. Mutually exclusive with box.
     */
    shapeKeys?: Set<string> | null
    /** "string:fret" keys of the overlay chord's dots — they get rung. */
    overlayKeys?: Set<string> | null
    /** Octave-map connectors, drawn as lines between the linked dots. */
    links?: OctaveLink[] | null
    /** "string:fret" → harmonic role; dots in the map get role-tinted. */
    roles?: Map<string, ToneRole> | null
    /** Quiz mode: blank every dot label so the board keeps its secrets. */
    hideLabels?: boolean
    /**
     * Quiz rings at these positions (dots there or not): a solid one where a
     * right answer landed, dashed ones for the reveal after a miss.
     */
    marks?: { string: number; fret: number; kind?: 'hit' | 'reveal' }[] | null
    /** Quiz mode: dots ignore the pointer so taps land on the cells. */
    passiveDots?: boolean
  }>(),
  {
    labelMode: 'names',
    handedness: 'right',
    stringOrder: 'bass-bottom',
    offsets: undefined,
    fretCount: 12,
    focusedMidi: null,
    ghost: null,
    box: null,
    shapeKeys: null,
    overlayKeys: null,
    links: null,
    roles: null,
    hideLabels: false,
    marks: null,
    passiveDots: false,
  },
)

const emit = defineEmits<{
  tune: [stringIndex: number, delta: 1 | -1]
  selectPitch: [midi: number]
  cell: [stringIndex: number, fret: number]
}>()

// Under a finger the rows grow; the width — and so the board's scale — does
// not, so this is the one dimension the pointer type changes (UX-07).
const coarse = useMediaQuery(COARSE_POINTER)
const gap = computed(() => (coarse.value ? GEOM.coarseStringGap : GEOM.stringGap))
const rowY = (index: number) =>
  stringY(index, props.tuning.strings.length, props.stringOrder, gap.value)

const width = computed(() => boardWidth(props.fretCount))
const height = computed(() => boardHeight(props.tuning.strings.length, gap.value))
const mx = (x: number) => mirrorX(x, props.handedness, width.value)

const boardTop = computed(() => GEOM.topPad)
const boardBottom = computed(() => GEOM.topPad + props.tuning.strings.length * gap.value)

const strings = computed(() =>
  props.tuning.strings.map((_, i) => ({
    index: i,
    y: rowY(i),
    letter: formatNote(props.tuning.letters[i] ?? ''),
    altered: (props.offsets?.[i] ?? 0) !== 0,
    // Lower strings draw thicker, whatever row they display on.
    thickness: 2.4 - (i * 1.6) / Math.max(1, props.tuning.strings.length - 1),
  })),
)

const fretWires = computed(() =>
  Array.from({ length: props.fretCount }, (_, i) => mx(fretWireX(i + 1))),
)

const fretNumbers = computed(() =>
  numberedFrets(props.fretCount).map(f => ({
    fret: f,
    x: mx(fretWireX(f) - GEOM.fretWidth / 2),
  })),
)

const markers = computed(() =>
  markerFrets(props.fretCount).map(m => ({
    ...m,
    x: mx(fretWireX(m.fret) - GEOM.fretWidth / 2),
  })),
)

const renderedDots = computed(() =>
  props.dots.map(d => {
    const key = `${d.string}:${d.fret}`
    const role = props.roles?.get(key) ?? null
    return {
      key,
      string: d.string,
      fret: d.fret,
      midi: d.midi,
      x: dotX(d.fret, props.handedness, width.value),
      y: rowY(d.string),
      label: props.hideLabels
        ? ''
        : props.labelMode === 'names'
          ? formatNote(d.note)
          : formatDegree(d.degree),
      // With a roles map the map owns all tinting: an out-of-frame dot stays
      // neutral even if it is the selection's root, and the frame's own root
      // tints via its role class instead.
      cls: props.roles
        ? d.isOptional
          ? 'fb-dot-optional'
          : 'fb-dot-normal'
        : d.isRoot
          ? 'fb-dot-root'
          : d.isOptional
            ? 'fb-dot-optional'
            : 'fb-dot-normal',
      role,
      roleCls: role ? `fb-dot-role-${role}` : null,
      hit: d.midi === props.focusedMidi,
      inBox: (!props.box || dotInBox(d, props.box)) && (!props.shapeKeys || props.shapeKeys.has(key)),
      inOverlay: props.overlayKeys?.has(key) ?? false,
    }
  }),
)

// The active box's outline, mirrored edge by edge so left-handed boards get
// the same span.
const boxOutline = computed(() => {
  if (!props.box) return null
  const { x1, x2 } = boxSpanX(props.box.minFret, props.box.maxFret)
  const [a, b] = [mx(x1), mx(x2)]
  return { x: Math.min(a, b), w: Math.abs(b - a) }
})

// Octave-map connectors between linked dot centers, through the same
// geometry transforms as the dots themselves.
const renderedLinks = computed(() =>
  (props.links ?? []).map(l => ({
    key: `${l.from.string}:${l.from.fret}-${l.to.string}:${l.to.fret}`,
    x1: dotX(l.from.fret, props.handedness, width.value),
    y1: rowY(l.from.string),
    x2: dotX(l.to.fret, props.handedness, width.value),
    y2: rowY(l.to.string),
  })),
)

// Invisible click targets over every string × fret cell (open column
// included) so empty positions are identifiable, not just the dots.
const cells = computed(() => {
  const out: { s: number; f: number; x: number; y: number; w: number }[] = []
  for (let s = 0; s < props.tuning.strings.length; s++) {
    for (let f = 0; f <= props.fretCount; f++) {
      const w = f === 0 ? GEOM.openWidth : GEOM.fretWidth
      out.push({
        s,
        f,
        x: dotX(f, props.handedness, width.value) - w / 2,
        y: rowY(s) - gap.value / 2,
        w,
      })
    }
  }
  return out
})

const renderedMarks = computed(() =>
  (props.marks ?? []).map(m => ({
    key: `${m.string}:${m.fret}`,
    cls: m.kind === 'hit' ? 'fb-mark-hit' : 'fb-mark-reveal',
    x: dotX(m.fret, props.handedness, width.value),
    y: rowY(m.string),
  })),
)

const renderedGhost = computed(() =>
  props.ghost
    ? {
        x: dotX(props.ghost.fret, props.handedness, width.value),
        y: rowY(props.ghost.string),
        label: formatNote(props.ghost.name),
      }
    : null,
)

// The ± circles are 7.4 units across a board that renders at ~0.85, so each
// gets an invisible rect behind it: wider than the circle, and exactly one
// string row tall, so neighbouring tuners keep their own taps (UX-07).
const tunerHit = computed(() => ({ w: GEOM.tunerHit, h: gap.value }))

const tuners = computed(() =>
  strings.value.map(s => ({
    ...s,
    upX: mx(GEOM.tunerWidth - 14),
    downX: mx(14),
    hitY: s.y - tunerHit.value.h / 2,
  })),
)

function onTunerKey(e: KeyboardEvent, index: number, delta: 1 | -1) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('tune', index, delta)
  }
}
</script>

<template>
  <svg
    class="fretboard"
    :class="{
      'fb-focus-dim': focusedMidi !== null,
      'fb-box-dim': box !== null || shapeKeys !== null,
    }"
    :viewBox="`0 0 ${width} ${height}`"
    role="group"
    aria-label="Fretboard"
  >
    <!-- fret numbers -->
    <text
      v-for="n in fretNumbers"
      :key="`num-${n.fret}`"
      class="fb-fret-number"
      :x="n.x"
      :y="boardTop - 9"
      text-anchor="middle"
    >
      {{ n.fret }}
    </text>

    <!-- nut -->
    <rect
      class="fb-nut"
      :x="mx(nutX()) - (handedness === 'left' ? GEOM.nutWidth : 0)"
      :y="boardTop"
      :width="GEOM.nutWidth"
      :height="boardBottom - boardTop"
    />

    <!-- fret wires -->
    <line
      v-for="(x, i) in fretWires"
      :key="`wire-${i}`"
      class="fb-fret-wire"
      :x1="x"
      :x2="x"
      :y1="boardTop"
      :y2="boardBottom"
    />

    <!-- strings -->
    <line
      v-for="s in strings"
      :key="`string-${s.index}`"
      class="fb-string"
      :class="{ 'fb-string-altered': s.altered }"
      :data-string="s.index"
      :x1="mx(GEOM.tunerWidth)"
      :x2="mx(width - 8)"
      :y1="s.y"
      :y2="s.y"
      :stroke-width="s.thickness"
    />

    <!-- identify targets: one transparent cell per string × fret -->
    <rect
      v-for="c in cells"
      :key="`cell-${c.s}:${c.f}`"
      class="fb-cell"
      :data-string="c.s"
      :data-fret="c.f"
      :x="c.x"
      :y="c.y"
      :width="c.w"
      :height="gap"
      @click="emit('cell', c.s, c.f)"
    />

    <!-- active box outline -->
    <rect
      v-if="boxOutline"
      class="fb-box-outline"
      :x="boxOutline.x"
      :y="boardTop - 4"
      :width="boxOutline.w"
      :height="boardBottom - boardTop + 8"
      rx="8"
    />

    <!-- position markers -->
    <g v-for="m in markers" :key="`marker-${m.fret}`" class="fb-marker" :data-fret="m.fret">
      <template v-if="m.double">
        <circle :cx="m.x - 7" :cy="boardBottom + 12" r="3.4" />
        <circle :cx="m.x + 7" :cy="boardBottom + 12" r="3.4" />
      </template>
      <circle v-else :cx="m.x" :cy="boardBottom + 12" r="3.4" />
    </g>

    <!-- octave-map connectors, under the dots they join -->
    <line
      v-for="l in renderedLinks"
      :key="`link-${l.key}`"
      class="fb-octave-line"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
    />

    <!-- note dots -->
    <g
      v-for="d in renderedDots"
      :key="d.key"
      class="fb-dot"
      :class="[d.cls, d.roleCls, { 'fb-dot-hit': d.hit, 'fb-dot-inbox': d.inBox, 'fb-dot-overlay': d.inOverlay, 'fb-dot-passive': passiveDots }]"
      :data-string="d.string"
      :data-fret="d.fret"
      :data-midi="d.midi"
      :data-overlay="d.inOverlay || undefined"
      :data-role="d.role || undefined"
      @click.stop="emit('selectPitch', d.midi)"
    >
      <circle :cx="d.x" :cy="d.y" r="10" />
      <text :x="d.x" :y="d.y + 3.4" text-anchor="middle">{{ d.label }}</text>
    </g>

    <!-- quiz reveal: dashed rings on every answer position -->
    <circle
      v-for="m in renderedMarks"
      :key="`mark-${m.key}`"
      class="fb-mark"
      :class="m.cls"
      :cx="m.x"
      :cy="m.y"
      r="12.5"
    />

    <!-- ghost: an identified empty position -->
    <g v-if="renderedGhost" class="fb-ghost">
      <circle :cx="renderedGhost.x" :cy="renderedGhost.y" r="10" />
      <text :x="renderedGhost.x" :y="renderedGhost.y + 3.4" text-anchor="middle">
        {{ renderedGhost.label }}
      </text>
    </g>

    <!-- per-string tuners -->
    <g v-for="t in tuners" :key="`tuner-${t.index}`" class="fb-tuner" :data-string="t.index">
      <text
        class="fb-open-letter"
        :class="{ 'fb-string-altered-letter': t.altered }"
        :x="mx(GEOM.tunerWidth / 2)"
        :y="t.y + 3.4"
        text-anchor="middle"
      >
        {{ t.letter }}
      </text>
      <g
        class="fb-tuner-btn fb-tuner-up"
        role="button"
        tabindex="0"
        :aria-label="`Tune string ${t.index + 1} up a semitone`"
        @click="emit('tune', t.index, 1)"
        @keydown="onTunerKey($event, t.index, 1)"
      >
        <rect
          class="fb-tuner-hit"
          :x="t.upX - tunerHit.w / 2"
          :y="t.hitY"
          :width="tunerHit.w"
          :height="tunerHit.h"
        />
        <circle :cx="t.upX" :cy="t.y" r="7.4" />
        <text :x="t.upX" :y="t.y + 3.2" text-anchor="middle">+</text>
      </g>
      <g
        class="fb-tuner-btn fb-tuner-down"
        role="button"
        tabindex="0"
        :aria-label="`Tune string ${t.index + 1} down a semitone`"
        @click="emit('tune', t.index, -1)"
        @keydown="onTunerKey($event, t.index, -1)"
      >
        <rect
          class="fb-tuner-hit"
          :x="t.downX - tunerHit.w / 2"
          :y="t.hitY"
          :width="tunerHit.w"
          :height="tunerHit.h"
        />
        <circle :cx="t.downX" :cy="t.y" r="7.4" />
        <text :x="t.downX" :y="t.y + 3.2" text-anchor="middle">−</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.fretboard {
  --fb-line: var(--hb-board-line);
  --fb-nut: var(--hb-nut);
  --fb-marker: var(--hb-marker);
  --fb-root: var(--hb-dot-root);
  --fb-tone: var(--hb-dot-tone);
  --fb-optional-stroke: var(--hb-optional-stroke);
  --fb-altered: var(--hb-altered);
  --fb-label: var(--hb-dot-tone-label);
  display: block;
  width: 100%;
  height: auto;
  font-family: system-ui, sans-serif;
}

.fb-fret-number {
  font-size: 11px;
  fill: var(--fb-line);
}

.fb-nut {
  fill: var(--fb-nut);
}

.fb-fret-wire {
  stroke: var(--fb-line);
  stroke-width: 1.4;
}

.fb-string {
  stroke: var(--fb-line);
}

.fb-string-altered {
  stroke: var(--fb-altered);
}

.fb-marker circle {
  fill: var(--fb-marker);
}

.fb-dot {
  cursor: pointer;
}

.fb-dot-passive {
  pointer-events: none;
}

.fb-dot text {
  font-size: 10px;
  fill: var(--fb-label);
  pointer-events: none;
}

/* Overlay ring first; a pinned pitch's accent ring wins when both apply. */
.fb-dot-overlay circle {
  stroke: var(--hb-overlay);
  stroke-width: 3;
}

.fb-dot-hit circle {
  stroke: var(--hb-accent);
  stroke-width: 3;
}

.fb-focus-dim .fb-dot:not(.fb-dot-hit) {
  opacity: 0.22;
}

.fb-box-outline {
  fill: var(--hb-accent);
  fill-opacity: 0.05;
  stroke: var(--hb-accent);
  stroke-opacity: 0.45;
  pointer-events: none;
}

.fb-box-dim .fb-dot:not(.fb-dot-inbox) {
  opacity: 0.22;
}

.fb-octave-line {
  stroke: var(--hb-accent);
  stroke-width: 2;
  stroke-opacity: 0.55;
  pointer-events: none;
}

.fb-cell {
  fill: transparent;
  cursor: pointer;
}

.fb-ghost {
  pointer-events: none;
}

.fb-mark {
  fill: none;
  stroke: var(--hb-good);
  stroke-width: 2.4;
  pointer-events: none;
}

/* the answer you missed, spelled out */
.fb-mark-reveal {
  stroke-dasharray: 4 3;
}

/* the spot you hit — solid, and gone again when the next question arrives */
.fb-mark-hit {
  stroke-width: 3;
}

@media (prefers-reduced-motion: no-preference) {
  .fb-mark-hit {
    /* scale about the ring's own centre, not the SVG origin */
    transform-box: fill-box;
    transform-origin: center;
    animation: fb-mark-pop 220ms ease-out;
  }
}

@keyframes fb-mark-pop {
  from {
    transform: scale(0.6);
    opacity: 0.4;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.fb-ghost circle {
  fill: var(--hb-surface);
  stroke: var(--hb-muted);
  stroke-width: 1.6;
  stroke-dasharray: 3 2.5;
}

.fb-ghost text {
  font-size: 10px;
  fill: var(--hb-text);
}

.fb-dot-root circle {
  fill: var(--fb-root);
}

.fb-dot-root text {
  fill: var(--hb-dot-root-label);
}

.fb-dot-normal circle {
  fill: var(--fb-tone);
}

.fb-dot-optional circle {
  fill: var(--hb-surface);
  stroke: var(--fb-optional-stroke);
  stroke-width: 1.6;
}

.fb-dot-optional text {
  fill: var(--fb-optional-stroke);
}

/* Tone-role tints — after the base dot styles so they win the cascade. With
   a roles map the map owns ALL tinting (the isRoot class is suppressed), so
   an out-of-frame dot stays neutral and the frame's own root — even an
   overlay chord's — tints as root. Optional dots recolor the stroke and
   label to keep their hollow style. */
.fb-dot-role-root {
  --fb-role: var(--fb-root);
}

.fb-dot-role-third {
  --fb-role: var(--hb-role-third);
}

.fb-dot-role-fifth {
  --fb-role: var(--hb-role-fifth);
}

.fb-dot-role-seventh {
  --fb-role: var(--hb-role-seventh);
}

.fb-dot-role-extension {
  --fb-role: var(--hb-role-extension);
}

.fb-dot-role-root circle,
.fb-dot-role-third circle,
.fb-dot-role-fifth circle,
.fb-dot-role-seventh circle,
.fb-dot-role-extension circle {
  fill: var(--fb-role);
}

.fb-dot-role-root text {
  fill: var(--hb-dot-root-label);
}

.fb-dot-role-third text,
.fb-dot-role-fifth text,
.fb-dot-role-seventh text,
.fb-dot-role-extension text {
  fill: var(--hb-role-label);
}

.fb-dot-optional.fb-dot-role-root circle,
.fb-dot-optional.fb-dot-role-third circle,
.fb-dot-optional.fb-dot-role-fifth circle,
.fb-dot-optional.fb-dot-role-seventh circle,
.fb-dot-optional.fb-dot-role-extension circle {
  fill: var(--hb-surface);
  stroke: var(--fb-role);
}

.fb-dot-optional.fb-dot-role-root text,
.fb-dot-optional.fb-dot-role-third text,
.fb-dot-optional.fb-dot-role-fifth text,
.fb-dot-optional.fb-dot-role-seventh text,
.fb-dot-optional.fb-dot-role-extension text {
  fill: var(--fb-role);
}

.fb-open-letter {
  font-size: 11px;
  fill: var(--fb-line);
}

.fb-string-altered-letter {
  fill: var(--fb-altered);
}

.fb-tuner-btn {
  cursor: pointer;
}

/* Transparent, not `none`: a painted fill is what makes it a target. */
.fb-tuner-hit {
  fill: transparent;
}

.fb-tuner-btn circle {
  fill: var(--hb-surface-2);
  stroke: var(--fb-line);
  stroke-width: 1;
}

.fb-tuner-btn text {
  font-size: 11px;
  fill: var(--fb-line);
  pointer-events: none;
}

.fb-tuner-btn:focus-visible circle {
  stroke: var(--fb-root);
  stroke-width: 2;
}
</style>
