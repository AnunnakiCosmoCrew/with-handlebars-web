<script setup lang="ts">
import { computed } from 'vue'
import {
  CHORD_TYPES,
  SCALE_TYPES,
  formatDegree,
  formatNote,
} from '@anunnakicosmocrew/handlebars'
import ComboSelect from './ui/ComboSelect.vue'

const props = defineProps<{
  mode: 'chord' | 'scale'
  root: string
  modelValue: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const rootLabel = computed(() => formatNote(props.root))

const options = computed(() =>
  props.mode === 'chord'
    ? CHORD_TYPES.map(c => ({
        value: c.id,
        label: `${rootLabel.value}${formatDegree(c.symbol)}`,
        sublabel: c.name,
      }))
    : SCALE_TYPES.map(s => ({ value: s.id, label: s.name })),
)
</script>

<template>
  <ComboSelect
    :model-value="modelValue"
    :options="options"
    searchable
    :search-placeholder="mode === 'chord' ? 'Search chords…' : 'Search scales…'"
    :label="mode === 'chord' ? 'Chord type' : 'Scale type'"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
