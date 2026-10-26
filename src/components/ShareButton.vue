<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { canShareBoard, permalink, shareBoard } from '../lib/share.js'
import { useRoomStore } from '../stores/room.js'

const store = useRoomStore()

// Whether anything can receive a board cannot change mid-session, so this is a
// plain const rather than a computed (the same reasoning as the support link
// in App.vue).
const canShare = canShareBoard()

// A share sheet announces itself; a clipboard write is silent, so that path is
// the only one that needs a word back.
const copied = ref(false)
let clearAt: ReturnType<typeof setTimeout> | undefined

async function share() {
  const outcome = await shareBoard({ title: store.info.title, url: permalink(store.snapshot) })
  if (outcome !== 'copied') return
  copied.value = true
  clearTimeout(clearAt)
  clearAt = setTimeout(() => (copied.value = false), 2000)
}

onBeforeUnmount(() => clearTimeout(clearAt))
</script>

<template>
  <div v-if="canShare" class="share">
    <button
      type="button"
      class="share-button"
      data-share
      aria-label="Share this board"
      @click="share"
    >
      <svg class="share-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 10.5V2" />
        <path d="M4.8 5.2 8 2l3.2 3.2" />
        <path d="M3.5 9v4.5h9V9" />
      </svg>
      <span class="button-label">Share</span>
    </button>
    <span class="share-note" role="status" aria-live="polite">{{ copied ? 'Link copied' : '' }}</span>
  </div>
</template>

<style scoped>
.share {
  position: relative;
  display: inline-block;
}

/* Sits next to Display and reads as its sibling: same accented outline, same
   weight — one control cluster, not two. */
.share-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-weight: 600;
  color: var(--hb-accent);
  background: var(--hb-control-bg);
  border: 1px solid var(--hb-accent);
  border-radius: 6px;
  cursor: pointer;
}

.share-button:hover {
  background: var(--hb-active-bg);
}

/* Narrow screens (ADR-0007): the word goes, the arrow stays. Two labelled
   buttons and the wordmark are ~54px more than a 402pt header line holds, and
   a second header row costs more than the word is worth. The aria-label on the
   trigger says what the icon means, in both layouts. */
@media (max-width: 640px) {
  .share-button .button-label {
    display: none;
  }
}

.share-icon {
  width: 15px;
  height: 15px;
  stroke: var(--hb-accent);
  stroke-width: 1.6;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The confirmation floats over the row instead of widening it, so the controls
   do not jump when the link lands on the clipboard. */
.share-note:not(:empty) {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  right: 0;
  white-space: nowrap;
  padding: 0.3rem 0.6rem;
  font-size: 0.85rem;
  color: var(--hb-text);
  background: var(--hb-surface);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  box-shadow: 0 6px 24px var(--hb-shadow);
}
</style>
