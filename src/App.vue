<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { audioEngine } from './audio/engine.js'
import { isNativeApp } from './lib/platform.js'
import { APP_STORE_URL, isIPhoneBrowser } from './lib/app-store.js'
import { attachExternalLinkHandler } from './lib/external-link.js'
import { boardWidth } from './components/fretboard-geometry.js'
import { applyScrollFraction, scrollFraction } from './lib/board-scroll.js'
import { STORAGE_KEY, useRoomStore } from './stores/room.js'
import { usePracticeStore } from './stores/practice.js'
import BrandMark from './BrandMark.vue'
import Fretboard from './components/Fretboard.vue'
import StaffView from './components/StaffView.vue'
import ModeToggle from './components/ModeToggle.vue'
import RootPicker from './components/RootPicker.vue'
import TypePicker from './components/TypePicker.vue'
import TuningPicker from './components/TuningPicker.vue'
import ShareButton from './components/ShareButton.vue'
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
import QuizBar from './components/QuizBar.vue'
import CollapseCard from './components/CollapseCard.vue'

const store = useRoomStore()
const practice = usePracticeStore()

// ADR-0003: the app shell carries no external commerce. The Ko-fi pill is
// website-only chrome — an external donation link is a classic App Store
// rejection (Guideline 3.1.1) — and the platform cannot change mid-session,
// so this is a plain const rather than a computed. The rest of the footer
// stays (the App Store link is website-only too: in the app it would point at
// itself): the crew link and the mailbox are not commerce, and inside the app
// they leave for a Safari sheet and the Mail app rather than the shell (HB-48).
const showSupportLink = !isNativeApp()

// HB-147: an iPhone browser gets the App Store badge in the top-right corner,
// above the header, on every visit, not only in the footer. Never inside the app, whose
// user agent also says iPhone; isIPhoneBrowser() asks isNativeApp() first.
const showHeaderStoreBadge = isIPhoneBrowser()

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
// Rotating the phone relayouts the board and takes the scroll position with
// it: someone studying the 12th fret lands back at the nut. Remember the place
// on the neck as a fraction of the scrollable range — the range changes when
// the viewport does, the place does not. The fraction has to be captured
// *before* the relayout, because by the time a resize fires the browser has
// already clamped scrollLeft to the new metrics; hence a scroll listener that
// keeps it current and a resize listener that only ever restores.
const boardScroll = ref<HTMLElement>()
let boardFraction = 0
let restorePending = false
let restoring = false

function onBoardScroll() {
  // A restore writes scrollLeft, and that write echoes back here as a scroll
  // event; letting it through would overwrite the fraction with whatever the
  // browser clamped the write to mid-relayout.
  if (restoring || !boardScroll.value) return
  boardFraction = scrollFraction(boardScroll.value)
}

function restoreBoardScroll() {
  restorePending = false
  restoring = true
  if (boardScroll.value) applyScrollFraction(boardScroll.value, boardFraction)
  // The echo is queued for the next rendering opportunity, not fired inline,
  // so the guard has to outlive this callback by a frame.
  requestAnimationFrame(() => {
    restoring = false
  })
}

// Deferred a frame: iOS fires resize while the new layout is still settling,
// and fires it more than once per rotation, so restorePending coalesces the
// burst — and drops as the restore runs, leaving a later resize free to
// restore again against the metrics that finally settled.
function onResize() {
  if (restorePending) return
  restorePending = true
  requestAnimationFrame(restoreBoardScroll)
}

// A left-handed board opens at the wrong end (UX-13). Handedness is a
// coordinate transform inside the SVG's viewBox, so the nut moves to the
// right of the drawing while the scroller's origin stays on the left: at
// scrollLeft 0 a left-handed player is looking at the 12th fret, no nut and
// no tuners. Send the scroller to the nut end on mount and whenever the hand
// changes — and keep the remembered fraction in step, or the next rotation
// would restore the old end.
function alignBoardToNut() {
  const el = boardScroll.value
  if (!el) return
  boardFraction = store.handedness === 'left' ? 1 : 0
  applyScrollFraction(el, boardFraction)
}

watch(
  () => store.handedness,
  () => {
    // The board re-renders mirrored first; align once it has.
    nextTick(alignBoardToNut)
  },
)

// One delegated listener for every external link in the room, so a link added
// later is covered without anyone remembering to wire it. No-op on the website.
let detachExternalLinks = () => {}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  detachExternalLinks = attachExternalLinkHandler()
  alignBoardToNut()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  detachExternalLinks()
})
</script>

<template>
  <div class="page">
    <main class="room">
      <!-- Two groups, not four rows: the header carries what acts on the room
           as a whole (the way home, the two ways out of it), the controls row
           carries what changes the board. Share and Display moved up here from
           the controls row so a phone spends one line on them instead of a
           third wrapped one, and the tuning moved down to make the space. -->
      <!-- HB-147: iPhone browsers only. A row of its own above the header, because
           Apple's badge (40pt tall at minimum, never cropped) does not fit beside
           the brand, Share and Display on a phone; the founder chose the cost of
           one line over moving the badge out of the top-right corner. -->
      <div v-if="showHeaderStoreBadge" class="store-row">
        <a
          class="store-badge-link"
          :href="APP_STORE_URL"
          rel="noopener"
          aria-label="Download With Handlebars on the App Store"
        >
          <img src="/download-on-the-app-store.svg" alt="Download on the App Store" width="120" height="40" />
        </a>
      </div>
      <header class="room-header">
        <a class="brand" href="/" title="Back to the fresh room" @click="goHome">
          <BrandMark class="brand-mark" />
          <div class="brand-text">
            <h1>With Handlebars</h1>
            <span class="brand-tag">guitar scales &amp; chords</span>
          </div>
        </a>
        <span class="spacer" />
        <ShareButton />
        <DisplayOptions />
      </header>

      <div class="room-controls">
        <TuningPicker
          :model-value="store.tuningId"
          :tuning="store.tuning"
          :is-custom="store.isCustomTuning"
          @update:model-value="store.setTuning($event)"
        />
        <ModeToggle v-model="store.mode" />
        <RootPicker v-model="store.root" />
        <TypePicker
          v-if="store.mode === 'chord'"
          v-model="store.chordId"
          mode="chord"
          :root="store.root"
        />
        <TypePicker v-else v-model="store.scaleId" mode="scale" :root="store.root" />
      </div>

      <div class="room-positions">
        <PositionPicker />
        <NeckLensPicker />
        <OverlayPicker v-if="store.mode === 'scale'" />
      </div>

      <div
        ref="boardScroll"
        class="board-scroll"
        :style="{ '--board-min-width': boardMinWidth }"
        @scroll.passive="onBoardScroll"
      >
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

      <!-- While a question is open, the quiz lives here, under the neck. -->
      <QuizBar />

      <RoleLegend />

      <!-- Notation stays full width: the staff is drawn at a fixed pixel width
           that grows with the note count, so a half-width card would scroll it
           on almost every chord. -->
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

      <!-- Two columns on a wide screen, one flow everywhere else: below the
           breakpoint both wrappers are `display: contents` and generate no
           boxes, so the phone renders the same source order it always did. -->
      <div class="room-panels">
        <div class="panel-col">
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
        </div>

        <div class="panel-col">
          <CollapseCard
            title="Practice"
            :open="store.practiceCard === 'show'"
            @toggle="togglePracticeCard()"
          >
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
        </div>
      </div>
    </main>

    <footer class="site-footer">
      <p>
        Every chord and scale tone, across the whole guitar neck, in any tuning — with
        your own spelling rules.
      </p>
      <p v-if="showSupportLink" class="site-footer-support">
        Do you like With Handlebars?
        <a class="support-link" href="https://ko-fi.com/cosmocrew" rel="noopener">♥ Support the crew</a>
      </p>
      <!-- Apple's own badge artwork, used as supplied: the guidelines rule out redrawing
           it, and the file is the one the other CosmoCrew sites ship. Website-only like
           the Ko-fi pill — inside the app it would point at itself. The caption is the
           listing's own platform line: iPhone, iPad, and "Requires macOS 12.0 or later
           and a Mac with Apple M1 chip or later" — the iPad build on Apple silicon, not
           a Mac target of this repo, so it must not say "Mac" unqualified. -->
      <p v-if="showSupportLink" class="site-footer-support site-footer-store">
        <a class="app-store-link" href="https://apps.apple.com/app/with-handlebars/id6815550767" rel="noopener" aria-label="Download With Handlebars on the App Store">
          <img src="/download-on-the-app-store.svg" alt="Download on the App Store" width="120" height="40" />
        </a>
        <span class="site-footer-platforms">One app for iPhone, iPad and Apple silicon Macs.</span>
      </p>
      <!-- Root-relative: the room also mounts on board pages (HB-153), where a bare
           about.html would resolve under /standard/…/. -->
      <p class="site-footer-fine">
        <a href="/about.html">About</a> ·
        <a href="/boards/">Boards</a> ·
        <a href="/privacy.html">Privacy</a> · a
        <a href="https://cosmocrew.dev/" rel="noopener">CosmoCrew</a>
        project ·
        <a href="mailto:contact@cosmocrew.dev">contact@cosmocrew.dev</a>
      </p>
      <p class="site-footer-fine">
        Guitar samples from the MusyngKite soundfont via
        <a href="https://github.com/gleitz/midi-js-soundfonts" rel="noopener">midi-js-soundfonts</a>
        (MIT).
      </p>
      <!-- Who owns the software, one click away: a reviewer who lands here and goes no
           further still learns it. Wording is fixed company-wide — copy it, don't
           re-derive it — and the entity has to be the link, not just the name. -->
      <p class="site-footer-fine">
        © 2026 CosmoCrew — a brand of
        <a href="https://luvita.tr/" rel="noopener">Luvita Teknoloji Ltd. Şti.</a>
      </p>
    </footer>
  </div>
</template>

<style scoped>
.page {
  /* 100vh first, then dvh: ADR-0003 sets an iOS 15.0 floor and dvh landed in
     Safari 15.4, so an older parser keeps the vh line and drops the one it
     cannot read. */
  min-height: 100vh;
  min-height: 100dvh;
  /* The only element that spans the viewport, so the only one that pays for the
     notch and the home indicator. Everything inside keeps its plain gutters;
     .board-scroll is the single exception, and it spends the horizontal insets
     back deliberately so the neck can still reach the glass. */
  padding: var(--hb-safe-top) var(--hb-safe-right) var(--hb-safe-bottom)
    var(--hb-safe-left);
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

.store-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.store-badge-link {
  display: inline-block;
  line-height: 0;
  border-radius: 7px;
}

.store-badge-link:focus-visible {
  outline: 2px solid var(--hb-accent);
  outline-offset: 2px;
}

.room-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
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

/* The one place above a portrait fold that says what instrument this is for.
   Landscape spends that line on the neck instead — see the block at the end. */
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

/* Pushes Share and Display to the far end of the header line. Where the line
   is too narrow to hold them — a 320pt phone — the row wraps instead, and the
   spacer collapses to nothing. */
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

/* Cancels .room's 1rem gutter *and* the horizontal safe inset .page paid, so
   the scroller reaches the physical screen edge while the board inside it
   still starts clear of the notch: the neck bleeds, the nut never hides under
   the sensor housing. Outside a media query on purpose — --hb-safe-* is 0px on
   the website, on an iPad and on any phone held upright, so this resolves to
   exactly the -1rem/1rem pair it replaces everywhere except the one case it
   exists for, a notched phone in landscape. One path, not two. */
.board-scroll {
  overflow-x: auto;
  margin-left: calc(-1rem - var(--hb-safe-left));
  margin-right: calc(-1rem - var(--hb-safe-right));
  padding-left: calc(1rem + var(--hb-safe-left));
  padding-right: calc(1rem + var(--hb-safe-right));
}

.board-scroll :deep(.fretboard) {
  min-width: var(--board-min-width, 640px);
}

/* The other horizontal scroller, bled the same way — a staff inset by the
   notch while the board above it runs edge to edge reads as a mistake. */
.staff-scroll {
  overflow-x: auto;
  margin: 1rem calc(-1rem - var(--hb-safe-right)) 0 calc(-1rem - var(--hb-safe-left));
  padding-left: calc(1rem + var(--hb-safe-left));
  padding-right: calc(1rem + var(--hb-safe-right));
}

.room-playback {
  margin: 1rem 0 1.25rem;
}

/* The card region is two wrappers with no boxes of their own until the wide
   breakpoint at the end of this file turns them into columns. `display:
   contents` is what makes that free: a phone lays the six blocks out in
   exactly the flow they had before the wrappers existed, margins collapsing
   between them as they always did, so no narrow-screen rendering changed. */
.room-panels,
.panel-col {
  display: contents;
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

.site-footer-support {
  margin: 0.5rem 0 0.65rem;
}

.site-footer a.support-link {
  display: inline-flex;
  align-items: center;
  margin-left: 0.35rem;
  padding: 0.28rem 0.75rem;
  border: 1px solid var(--hb-border);
  border-radius: 999px;
  background: var(--hb-surface);
  color: var(--hb-accent);
  text-decoration: none;
}

.site-footer a.support-link:hover,
.site-footer a.support-link:focus-visible {
  border-color: var(--hb-accent);
}

.site-footer-store {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.site-footer a.app-store-link {
  display: inline-block;
  line-height: 0;
  border-radius: 7px;
}

.site-footer a.app-store-link:focus-visible {
  outline: 2px solid var(--hb-accent);
  outline-offset: 2px;
}

.site-footer-platforms {
  font-size: 0.78rem;
}

/* The narrow-screen density layer (ADR-0007). Keyed on width, not on pointer:
   the tap floor asks "is a finger doing this?" (ADR-0006, in style.css) while
   density asks "how much room is there?" — and a desktop window dragged to
   400px wraps exactly the way a phone does. 640px is the breakpoint the room
   already had, kept rather than a second number introduced beside it.

   What it buys is the whole point of UX-11: header, controls, positions and
   strings wrapped onto seven lines on a 402pt iPhone and pushed the neck to
   y 490, below the fold. These rules put the fretboard on the first screen. */
@media (max-width: 640px) {
  .room {
    padding-top: 0.9rem;
  }

  .room-header {
    margin-bottom: 0.55rem;
  }

  .room-controls {
    gap: 0.5rem;
    margin-bottom: 0.7rem;
  }

  /* One picker per row, each free to scroll, instead of three pickers wrapping
     into one another and landing wherever the widths happen to fall. */
  .room-positions {
    flex-direction: column;
    /* nowrap as well as column: a wrapping column flex container lays its
       items out in *columns*, and each one is then as wide as its own widest
       item rather than as wide as the room — which is how a row meant to
       scroll ends up 592px wide inside a 402px phone, overflowing the page
       instead of itself. */
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 0.45rem;
    margin: 0 0 0.7rem;
  }

  /* The chips scroll sideways rather than wrap: seven positions, then six
     strings plus Octaves and Guides, all at the 44pt floor C2c gave them, is
     three lines each on a phone. The rules live here rather than in the two
     components because the decision is the room's, not the picker's — the same
     argument .board-scroll makes about the neck. Two classes deep, so they
     outrank the components' own scoped `flex-wrap: wrap`; the two class names
     they reach for are held by above-the-fold.spec.ts (ADR-0007). */
  .room-positions :deep(.position-picker),
  .room-positions :deep(.neck-lenses) {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    /* Bled to the glass exactly as .board-scroll is, and for the same reason
       in reverse: a row that stops cleanly inside the gutter looks finished.
       Ending on a half-visible chip at the screen edge is the only thing that
       tells a thumb there is more of the row to the right. */
    margin-left: calc(-1rem - var(--hb-safe-left));
    margin-right: calc(-1rem - var(--hb-safe-right));
    padding-left: calc(1rem + var(--hb-safe-left));
    padding-right: calc(1rem + var(--hb-safe-right));
  }

  /* Without this the chips share out the shortfall instead of overflowing, and
     a nowrap row silently becomes a row of squashed chips that never scrolls —
     undoing C2c's 44pt floor in the one place it matters most. */
  .room-positions :deep(.position-picker) > *,
  .room-positions :deep(.neck-lenses) > * {
    flex: none;
  }

  .room-positions :deep(.position-picker)::-webkit-scrollbar,
  .room-positions :deep(.neck-lenses)::-webkit-scrollbar {
    display: none;
  }
}

/* A phone held sideways is the board's best view: short, wide, the whole neck
   at once. Everything that is not the board gives back height for it.
   Gated on height as well as orientation because `orientation: landscape` is
   true of nearly every desktop window — without the second clause a 1440x900
   browser would get the phone layout. 480px clears the tallest iPhone
   landscape viewport (440pt on a Pro Max) and stays far below the shortest
   iPad one (768pt). A desktop window dragged this short gets it too, which is
   the right answer for that window as well. */
@media (orientation: landscape) and (max-height: 480px) {
  .room {
    padding-top: 0.6rem;
  }

  /* No phone is under 640pt wide in landscape, so the density layer above
     never fires here — this block is on its own, and only tightens. */
  .room-header {
    margin-bottom: 0.45rem;
  }

  .brand-mark {
    width: 20px;
    height: 20px;
  }

  .brand h1 {
    font-size: 1.05rem;
  }

  .brand-tag {
    display: none;
  }

  .room-controls {
    gap: 0.45rem;
    margin-bottom: 0.6rem;
  }

  /* Sideways there is width to spare and no height at all, so the three
     pickers go on *one* scrolling line rather than one line each: at 874pt
     they wrap onto two rows (three in scale mode), and each row is 44pt of the
     402 the screen has. Same trade as the portrait layer, the other way up —
     and no :deep() needed, because flex: none holds each picker at its natural
     width and its own flex-wrap never gets the chance to fire. */
  .room-positions {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    gap: 0 0.9rem;
    margin: -0.2rem calc(-1rem - var(--hb-safe-right)) 0.45rem
      calc(-1rem - var(--hb-safe-left));
    padding-left: calc(1rem + var(--hb-safe-left));
    padding-right: calc(1rem + var(--hb-safe-right));
  }

  .room-positions > * {
    flex: none;
  }

  .room-positions::-webkit-scrollbar {
    display: none;
  }

  .room-playback {
    margin: 0.6rem 0 0.75rem;
  }

  .site-footer {
    margin-top: 1.25rem;
  }
}

/* An iPad is not a big phone. Up to here the room is a 920px column that
   leaves 45px of empty margin on a 13-inch iPad in portrait and 216px in
   landscape, with every card stacked in one 2000px scroll (HB-51/C3).
   Above it the neck takes the width and the cards pair off into two columns.

   1000px is chosen against the devices, not the grid: it clears iPad Pro 13
   portrait (1024pt) and every iPad landscape, and stays above iPad Pro 11
   portrait (834pt) and iPad mini (744pt), where two columns would each be
   under 400pt — narrower than the wheel and the staff want. Those sizes keep
   the single column, which already fills their width. A Split View pane is
   simply a narrow viewport and lands on the same phone path.

   Everything here is min-width-gated on purpose: HB-86 is still to come for
   the narrow layout, and the two must not touch the same declarations. */
@media (min-width: 1000px) {
  .room {
    max-width: 1280px;
    padding: 1.75rem 1.5rem 0;
  }

  /* The board grows with the room, and unchecked that is 1.65x the desktop
     scale on a 13-inch iPad — a neck whose dots read as buttons. Cap it and
     centre it; the scroller keeps its full width so a long neck still
     scrolls under the same rules. */
  .board-scroll :deep(.fretboard) {
    max-width: 1100px;
    margin-inline: auto;
  }

  .room-panels {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    column-gap: 1.5rem;
  }

  /* Block, not flex: the cards keep the collapsing margins they were built
     with, so a column is the same vertical rhythm as the single-column page. */
  .panel-col {
    display: block;
    min-width: 0;
  }
}
</style>
