<script setup lang="ts">
import { computed, ref } from 'vue'
import { TUNINGS, formatNote, type Tuning } from '@anunnakicosmocrew/handlebars'
import ComboSelect from './ui/ComboSelect.vue'

const props = defineProps<{
  /** Selected preset id. */
  modelValue: string
  /** Effective tuning (preset + offsets) for the header letters. */
  tuning: Tuning
  isCustom: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
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
</script>

<template>
  <div class="tuning">
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
    <div v-if="open" class="tuning-dialog" role="dialog" aria-label="Choose tuning">
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

.tuning-dialog {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  width: 17rem;
  background: var(--hb-surface);
  border: 1px solid var(--hb-border);
  border-radius: 8px;
  box-shadow: 0 6px 24px var(--hb-shadow);
  padding: 0.5rem;
}
</style>
