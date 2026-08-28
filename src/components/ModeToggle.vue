<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = defineProps<{ modelValue: 'chord' | 'scale' }>()
const emit = defineEmits<{ 'update:modelValue': [value: 'chord' | 'scale'] }>()

const options = [
  { value: 'chord', label: 'Chord' },
  { value: 'scale', label: 'Scale' },
] as const

const buttons = ref<HTMLButtonElement[]>([])

async function onKeydown(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
  e.preventDefault()
  const next = props.modelValue === 'chord' ? 'scale' : 'chord'
  emit('update:modelValue', next)
  // Roving tabindex: focus must follow selection or it strands on tabindex=-1.
  // (v-for template-ref arrays don't guarantee order, so find by checked state.)
  await nextTick()
  buttons.value.find(b => b.getAttribute('aria-checked') === 'true')?.focus()
}
</script>

<template>
  <div class="mode-toggle" role="radiogroup" aria-label="Chord or scale mode" @keydown="onKeydown">
    <button
      v-for="o in options"
      :key="o.value"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="modelValue === o.value"
      :class="{ selected: modelValue === o.value }"
      :tabindex="modelValue === o.value ? 0 : -1"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  overflow: hidden;
}

.mode-toggle button {
  padding: 0.4rem 0.9rem;
  font: inherit;
  background: var(--hb-surface);
  border: none;
  cursor: pointer;
}

.mode-toggle button + button {
  border-left: 1px solid var(--hb-border);
}

.mode-toggle button.selected {
  background: var(--hb-accent);
  color: var(--hb-accent-contrast);
}
</style>
