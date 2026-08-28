<script setup lang="ts">
import { computed } from 'vue'
import { formatDegree, formatNote, type SelectionInfo } from '@anunnakicosmocrew/handlebars'

const props = defineProps<{ info: SelectionInfo; mode: 'chord' | 'scale' }>()

const fmtWrapped = (fmt: (s: string) => string) => (v: string) =>
  v.startsWith('(') ? `(${fmt(v.slice(1, -1))})` : fmt(v)

const title = computed(() => formatDegree(formatNote(props.info.title)))
const aka = computed(() => props.info.aka.map(a => formatDegree(formatNote(a))))
const intervals = computed(() => props.info.intervals.map(fmtWrapped(formatDegree)))
const notes = computed(() => props.info.notes.map(fmtWrapped(formatNote)))
const hasOptional = computed(
  () => props.info.halfSteps.length !== props.info.halfStepsRequired.length,
)
</script>

<template>
  <section class="info" aria-label="Selection details">
    <h2 class="info-title">{{ title }}</h2>
    <dl>
      <template v-if="mode === 'chord' && aka.length">
        <dt>a.k.a.</dt>
        <dd>{{ aka.join(', ') }}</dd>
      </template>
      <dt>intervals</dt>
      <dd>{{ intervals.join(', ') }}</dd>
      <dt>half-steps</dt>
      <dd>
        <template v-if="hasOptional">
          {{ info.halfStepsRequired.join('-') }} <small>(excl. optional)</small><br />
          {{ info.halfSteps.join('-') }} <small>(incl. optional)</small>
        </template>
        <template v-else>{{ info.halfSteps.join('-') }}</template>
      </dd>
      <dt>notes</dt>
      <dd>{{ notes.join(', ') }}</dd>
    </dl>
  </section>
</template>

<style scoped>
.info-title {
  font-size: 1.15rem;
  margin: 0 0 0.4rem;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.9rem;
  margin: 0;
}

dt {
  color: var(--hb-muted);
  font-size: 0.85rem;
}

dd {
  margin: 0;
}

dd small {
  color: var(--hb-muted);
}
</style>
