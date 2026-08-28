<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FRET_COUNTS } from '../lib/url-state.js'
import { useRoomStore } from '../stores/room.js'

const store = useRoomStore()
const open = ref(false)
const rootEl = ref<HTMLElement>()
const buttonEl = ref<HTMLButtonElement>()

function close() {
  open.value = false
  buttonEl.value?.focus()
}

// Dismissal has to come from the pointer, not from focus alone. Pressing a
// radio's *label* blurs the button before the browser hands focus to the
// input, so a focusout-only rule tore the panel down mid-click and swallowed
// the setting — the click never reached the input that was already gone.
function onPointerdown(e: PointerEvent) {
  if (open.value && !rootEl.value?.contains(e.target as Node)) open.value = false
}

// Focus leaving for somewhere else (tabbing away) still closes; focus going
// nowhere in particular is the label case above, and is left to the pointer.
function onFocusout(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  if (next && !rootEl.value?.contains(next)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onPointerdown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerdown))
</script>

<template>
  <div ref="rootEl" class="display-options" @focusout="onFocusout">
    <button
      ref="buttonEl"
      type="button"
      class="display-button"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg class="display-icon" viewBox="0 0 16 16" aria-hidden="true">
        <line x1="1.5" y1="4" x2="14.5" y2="4" />
        <circle cx="10.5" cy="4" r="2.1" />
        <line x1="1.5" y1="8" x2="14.5" y2="8" />
        <circle cx="5" cy="8" r="2.1" />
        <line x1="1.5" y1="12" x2="14.5" y2="12" />
        <circle cx="8.5" cy="12" r="2.1" />
      </svg>
      Display
    </button>
    <div
      v-if="open"
      class="display-panel"
      role="dialog"
      aria-label="Display options"
      @keydown.escape.stop="close()"
    >
      <fieldset>
        <legend>Handedness</legend>
        <label><input v-model="store.handedness" type="radio" name="hb-handedness" value="right" /> Right</label>
        <label><input v-model="store.handedness" type="radio" name="hb-handedness" value="left" /> Left</label>
      </fieldset>
      <fieldset>
        <legend>Bass strings</legend>
        <label><input v-model="store.stringOrder" type="radio" name="hb-string-order" value="bass-bottom" /> Bottom</label>
        <label><input v-model="store.stringOrder" type="radio" name="hb-string-order" value="bass-top" /> Top</label>
      </fieldset>
      <fieldset>
        <legend>Labels</legend>
        <label><input v-model="store.labelMode" type="radio" name="hb-labels" value="names" /> Names</label>
        <label><input v-model="store.labelMode" type="radio" name="hb-labels" value="intervals" /> Intervals</label>
      </fieldset>
      <fieldset>
        <legend>Spelling</legend>
        <label><input v-model="store.spelling" type="radio" name="hb-spelling" value="strict" /> Strict</label>
        <label><input v-model="store.spelling" type="radio" name="hb-spelling" value="simple" /> Simple</label>
      </fieldset>
      <fieldset>
        <legend>Frets</legend>
        <label v-for="n in FRET_COUNTS" :key="n">
          <input v-model="store.fretCount" type="radio" name="hb-frets" :value="n" /> {{ n }}
        </label>
      </fieldset>
      <fieldset>
        <legend>Notation</legend>
        <label><input v-model="store.staff" type="radio" name="hb-staff" value="show" /> Show</label>
        <label><input v-model="store.staff" type="radio" name="hb-staff" value="hide" /> Hide</label>
      </fieldset>
      <fieldset>
        <legend>Tone roles</legend>
        <label><input v-model="store.roles" type="radio" name="hb-roles" value="off" /> Off</label>
        <label><input v-model="store.roles" type="radio" name="hb-roles" value="on" /> Show</label>
      </fieldset>
      <fieldset>
        <legend>Circle</legend>
        <label><input v-model="store.circle" type="radio" name="hb-circle" value="show" /> Show</label>
        <label><input v-model="store.circle" type="radio" name="hb-circle" value="hide" /> Hide</label>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.display-options {
  position: relative;
  display: inline-block;
}

/* The gateway to every board setting — an accented sliders icon keeps it
   findable among the plain text controls. */
.display-button {
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

.display-button:hover {
  background: var(--hb-active-bg);
}

.display-icon {
  width: 15px;
  height: 15px;
  stroke: var(--hb-accent);
  stroke-width: 1.6;
  fill: var(--hb-surface);
}

.display-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  right: 0;
  width: 15rem;
  background: var(--hb-surface);
  border: 1px solid var(--hb-border);
  border-radius: 8px;
  box-shadow: 0 6px 24px var(--hb-shadow);
  padding: 0.6rem 0.8rem;
}

fieldset {
  border: none;
  margin: 0 0 0.5rem;
  padding: 0;
}

legend {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hb-muted);
  padding: 0;
  margin-bottom: 0.15rem;
}

fieldset label {
  margin-right: 0.9rem;
  cursor: pointer;
}
</style>
