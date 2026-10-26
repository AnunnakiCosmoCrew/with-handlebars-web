<script setup lang="ts">
import {
  applyStringOffsets,
  getFretboardDots,
  getSelectionInfo,
  getTuning,
  type Selection,
  type ToneRole,
} from '@anunnakicosmocrew/handlebars'
import BrandMark from '../BrandMark.vue'
import Fretboard from '../components/Fretboard.vue'
import { boardFromPath } from '../lib/board-path.js'
import { DEFAULT_STATE, boardState, parseQuery, type RoomState } from '../lib/url-state.js'

/**
 * The link-preview card (og:image), drawn with the room's own Fretboard and
 * design tokens so the picture can never drift from the product. The query
 * string picks what the board shows — tools/render-og.sh screenshots this page
 * at 1200x630 and writes public/og.png, and the build renders one per board
 * page (tools/og-cards-plugin.ts, HB-155).
 */

/** Where the card starts before any query — the site's own calling card. */
const CARD_DEFAULTS: RoomState = {
  ...DEFAULT_STATE,
  mode: 'scale',
  root: 'A',
  scaleId: 'pentatonic-minor',
  fretCount: 24,
  roles: 'on',
}

// Read the query with the room's own parser rather than a second contract of
// our own: any shareable room link (?root=E&chord=maj7) renders a card of
// exactly what the sender saw, with the same validation on the way in.
const search = typeof location === 'undefined' ? '' : location.search
const query = new URLSearchParams(search)

// A board page's card names its page: `?board=/standard/a/chord/minor-7/` is
// read with the room's own path mapping, so the card shows exactly the board
// the page does, and a path outside the inventory falls back to the query.
const board = boardFromPath(query.get('board') ?? '')
const state: RoomState = {
  ...CARD_DEFAULTS,
  ...parseQuery(search),
  ...(board ? boardState(board) : {}),
}

// `size=wide` is the 16:9 frame (1200x675) Discover takes for a large preview;
// the default is Open Graph's 1200x630.
const wide = query.get('size') === 'wide'

// One flag needs help: the room defaults tone-role colour off and so only ever
// parses `roles=on`, while the card defaults it on. Read the off switch here so
// an uncoloured board stays reachable from a card query.
if (query.get('roles') === 'off') state.roles = 'off'

const selection: Selection = {
  mode: state.mode,
  root: state.root,
  typeId: state.mode === 'chord' ? state.chordId : state.scaleId,
}

const baseTuning = getTuning(state.tuningId)
const offsets =
  state.offsets.length === baseTuning.strings.length
    ? state.offsets
    : Array<number>(baseTuning.strings.length).fill(0)
const tuning = applyStringOffsets(baseTuning, offsets)

// Nothing here is reactive: the card is rendered once and photographed.
const dots = getFretboardDots(tuning, selection, state.spelling, state.fretCount)
const title = getSelectionInfo(selection, state.spelling).title
const strings = `${tuning.letters.join(' ')} · ${state.fretCount} frets`

const roles =
  state.roles === 'on'
    ? new Map<string, ToneRole>(dots.map(d => [`${d.string}:${d.fret}`, d.role]))
    : null

const ROLE_TEXT: Record<ToneRole, string> = {
  root: 'Root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
  extension: 'Extensions',
}
const ROLE_ORDER = Object.keys(ROLE_TEXT) as ToneRole[]

const present = new Set(roles ? roles.values() : [])
const legend = ROLE_ORDER.filter(r => present.has(r)).map(r => ({ role: r, text: ROLE_TEXT[r] }))
</script>

<template>
  <div class="card" :class="{ wide }">
    <header>
      <BrandMark class="mark" />
      <div class="wordmark">
        <h1>With Handlebars</h1>
        <p class="tagline">guitar scales &amp; chords</p>
      </div>
    </header>

    <p class="pitch">Every tone of any chord or scale, everywhere on the neck.</p>

    <div class="panel">
      <div class="panel-head">
        <span class="selection">{{ title }}</span>
        <span class="strings">{{ strings }}</span>
      </div>
      <Fretboard
        :tuning="tuning"
        :dots="dots"
        :fret-count="state.fretCount"
        :label-mode="state.labelMode"
        :handedness="state.handedness"
        :string-order="state.stringOrder"
        :offsets="offsets"
        :roles="roles"
      />
      <ul v-if="legend.length" class="legend">
        <li v-for="e in legend" :key="e.role">
          <span class="swatch" :class="`swatch-${e.role}`" aria-hidden="true" />{{ e.text }}
        </li>
      </ul>
    </div>

    <footer>
      <span>58 chord qualities · 168 scales · 30 tunings · notation · playback</span>
      <span class="domain">withhandlebars.com</span>
    </footer>
  </div>
</template>

<style scoped>
/* Fixed to the og:image frame — the renderer screenshots exactly this box. */
.card {
  box-sizing: border-box;
  width: 1200px;
  height: 630px;
  padding: 44px 52px 40px;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(
      120% 95% at 62% 60%,
      color-mix(in srgb, var(--hb-accent) 26%, transparent),
      transparent 62%
    ),
    var(--hb-bg);
  color: var(--hb-text);
  overflow: hidden;
}

.card.wide {
  height: 675px;
}

header {
  display: flex;
  align-items: center;
  gap: 18px;
}

.mark {
  width: 58px;
  height: 58px;
  flex: none;
}

h1 {
  margin: 0;
  font-size: 52px;
  line-height: 1.05;
  letter-spacing: -0.025em;
}

.tagline {
  margin: 6px 0 0;
  font-size: 21px;
  letter-spacing: 0.04em;
  color: var(--hb-muted);
}

/* The whole product in one line, and the only thing still legible when a
   platform shrinks the card to a thumbnail. */
.pitch {
  margin: 26px 0 0;
  max-width: 620px;
  font-size: 41px;
  line-height: 1.24;
  letter-spacing: -0.02em;
  color: var(--hb-text);
}

.panel {
  margin-top: auto;
  box-sizing: border-box;
  padding: 22px 24px 20px;
  border: 1px solid var(--hb-border);
  border-radius: 20px;
  background: var(--hb-surface);
  box-shadow: 0 30px 70px var(--hb-shadow);
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}

.selection {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.strings {
  font-size: 18px;
  color: var(--hb-muted);
}

.legend {
  display: flex;
  gap: 22px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 17px;
  color: var(--hb-muted);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.swatch-root {
  background: var(--hb-dot-root);
}

.swatch-third {
  background: var(--hb-role-third);
}

.swatch-fifth {
  background: var(--hb-role-fifth);
}

.swatch-seventh {
  background: var(--hb-role-seventh);
}

.swatch-extension {
  background: var(--hb-role-extension);
}

footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 26px;
  font-size: 20px;
  color: var(--hb-muted);
}

.domain {
  font-weight: 600;
  color: var(--hb-accent);
}
</style>
