<script setup lang="ts">
import { computed } from 'vue'
import { ROOTS, formatNote } from '@anunnakicosmocrew/handlebars'
import ComboSelect from './ui/ComboSelect.vue'

defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// Enharmonic pairs are individually selectable — the choice drives spelling.
const options = computed(() =>
  ROOTS.map(r => ({
    value: r.root,
    label: formatNote(r.root),
    ...(r.enharmonic ? { sublabel: `= ${formatNote(r.enharmonic)}` } : {}),
  })),
)
</script>

<template>
  <ComboSelect
    :model-value="modelValue"
    :options="options"
    label="Root note"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
