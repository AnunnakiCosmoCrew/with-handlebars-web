<script setup lang="ts">
import { computed, ref } from 'vue'
import { TUNINGS, formatNote, type Tuning } from '@anunnakicosmocrew/handlebars'
import ComboSelect from './ui/ComboSelect.vue'
import { useFloatingPanel } from '../composables/useFloatingPanel.js'

const props = defineProps<{
  /** Selected preset id. */
  modelValue: string
  /** Effective tuning (preset + offsets) for the header letters. */
  tuning: Tuning
  isCustom: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const rootEl = ref<HTMLElement>()
const panelEl = ref<HTMLElement>()
const buttonEl = ref<HTMLButtonElement>()

const headerLetters = computed(() => props.tuning.letters.map(formatNote).join(''))
const headerName = computed(() => {
  const preset = TUNINGS.find(t => t.id === props.modelValue)
  return props.tuning.id === 'custom' ? 'Custom tuning' : (preset?.name ?? props.modelValue)
})

const options = TUNINGS.map(t => ({
  value: t.id,
  label: t.letters.map(formatNote).join(''),
  sublabel: t.name,
}))

function close() {
  open.value = false
  buttonEl.value?.focus()
}

function select(id: string) {
  emit('update:modelValue', id)
  close()
}

// This component owns the dialog, so it owns the dismissal too — the inline
// ComboSelect inside it deliberately installs no listener of its own. Dismissing
// without re-focusing the button: on iOS pulling focus back is what raises the
// keyboard again. Escape and a selection still go through close(), which does
// return focus, because there a keyboard user is asking for it.
const { panelStyle, onFocusout } = useFloatingPanel({
  open,
  root: rootEl,
  panel: panelEl,
  close: () => (open.value = false),
})
</script>

<template>
  <div ref="rootEl" class="tuning" @focusout="onFocusout">
    <span class="tuning-caption" aria-hidden="true">Tuning</span>
    <button
      ref="buttonEl"
      type="button"
      class="tuning-header"
      :class="{ custom: isCustom }"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-label="`Tuning: ${headerLetters} ${headerName}`"
      @click="open ? close() : (open = true)"
    >
      <strong class="tuning-letters">{{ headerLetters }}</strong>
      <span class="tuning-name">{{ headerName }}</span>
      <span class="tuning-caret" aria-hidden="true">▾</span>
    </button>
    <div
      v-if="open"
      ref="panelEl"
      class="tuning-dialog"
      :style="panelStyle"
      role="dialog"
      aria-label="Choose tuning"
    >
      <ComboSelect
        :model-value="modelValue"
        :options="options"
        searchable
        inline
        search-placeholder="Search tunings…"
        label="Tuning preset"
        @update:model-value="select($event)"
        @dismiss="close()"
      />
    </div>
  </div>
</template>

<style scoped>
.tuning {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.tuning-caption {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hb-muted);
}

/* Dressed as a control, not a caption — the tuning changes everything on
   the board, so it has to look pressable. */
.tuning-header {
  display: inline-flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.4rem 0.7rem;
  font: inherit;
  background: var(--hb-control-bg);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  cursor: pointer;
}

.tuning-header:hover {
  border-color: var(--hb-accent);
  background: var(--hb-active-bg);
}

.tuning-caret {
  font-size: 0.7em;
  color: var(--hb-muted);
  align-self: center;
}

.tuning-letters {
  letter-spacing: 0.06em;
}

.tuning-header.custom .tuning-letters,
.tuning-header.custom .tuning-name {
  color: var(--hb-altered);
}

.tuning-name {
  font-size: 0.85em;
  color: var(--hb-muted);
}

/* Narrow screens (ADR-0007): the button drops to its letters. "TUNING" and
   "DADGAD" alongside D A D G A D are three ways of saying the same thing, and
   together they are ~80px of the row — enough to decide whether the controls
   wrap onto two lines or three. The letters are the part a player reads, and
   the trigger's aria-label still carries the caption and the full name, so
   nothing is lost to a screen reader. */
@media (max-width: 640px) {
  .tuning-caption,
  .tuning-name {
    display: none;
  }
}

.tuning-dialog {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  /* Same clamp as the other two floating panels (HB-83): the header row wraps
     on a phone, so the dialog's trigger can sit anywhere along it. */
  left: var(--hb-panel-shift, 0px);
  width: 17rem;
  max-width: var(--hb-panel-max-width);
  /* Its inner list caps itself, but the dialog carries a heading and six
     string rows on top of that — cap the wrapper too. */
  max-height: calc(100vh - 5rem);
  max-height: calc(100dvh - 5rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--hb-surface);
  border: 1px solid var(--hb-border);
  border-radius: 8px;
  box-shadow: 0 6px 24px var(--hb-shadow);
  padding: 0.5rem;
}
</style>
