<script setup lang="ts">
import { computed } from 'vue'
import { formatDegree, formatNote } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../stores/room.js'

const store = useRoomStore()

// The overlay chord's numeral header — "V7 · G7 — dominant" — shown when the
// panel is describing an overlay rather than the selection itself.
const overlayLine = computed(() => {
  const c = store.overlayInfo
  if (!c) return null
  const label = `${formatNote(c.root)}${formatDegree(c.label.slice(c.root.length))}`
  return {
    numeral: formatDegree(c.numeral),
    label,
    fn: c.fn,
  }
})

const rows = computed(() =>
  store.anatomy.tones.map(t => ({
    ...t,
    degree: t.optional ? `(${formatDegree(t.token)})` : formatDegree(t.token),
    name: t.optional ? `(${formatNote(t.note)})` : formatNote(t.note),
  })),
)

const stack = computed(() => {
  if (!store.anatomy.thirds) return null
  return {
    notes: store.anatomy.tones.map(t => formatNote(t.note)).join(' — '),
    thirds: store.anatomy.thirds.join(' + '),
  }
})
</script>

<template>
  <!-- The card header carries the "How it's built" title. -->
  <section class="anatomy" aria-label="How it's built">
    <p v-if="overlayLine" class="anatomy-overlay" data-overlay-line>
      <strong>{{ overlayLine.numeral }}</strong> · {{ overlayLine.label
      }}<template v-if="overlayLine.fn">
        — <em>{{ overlayLine.fn }}</em></template
      >
    </p>
    <p class="anatomy-summary">{{ store.anatomy.summary }}</p>
    <p v-if="stack" class="anatomy-stack" data-stack>
      {{ stack.notes }} <small>({{ stack.thirds }})</small>
    </p>
    <table class="anatomy-table">
      <thead>
        <tr>
          <th scope="col">degree</th>
          <th scope="col">note</th>
          <th scope="col">interval</th>
          <th scope="col">what it does</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in rows" :key="t.token" :data-token="t.token">
          <td>{{ t.degree }}</td>
          <td>{{ t.name }}</td>
          <td>{{ t.intervalWords }} <small>· {{ t.semitones }} half-steps</small></td>
          <td class="anatomy-comment">{{ t.comment }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.anatomy {
  margin-top: 1.25rem;
}

.anatomy-overlay {
  margin: 0 0 0.3rem;
}

.anatomy-summary {
  margin: 0 0 0.3rem;
  color: var(--hb-muted);
}

.anatomy-stack {
  margin: 0 0 0.5rem;
}

.anatomy-stack small,
.anatomy-table small {
  color: var(--hb-muted);
}

.anatomy-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.anatomy-table th {
  text-align: left;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hb-muted);
  font-weight: 500;
  padding: 0.25rem 0.9rem 0.25rem 0;
}

.anatomy-table td {
  padding: 0.25rem 0.9rem 0.25rem 0;
  border-top: 1px solid var(--hb-border);
  vertical-align: top;
}

.anatomy-comment {
  color: var(--hb-muted);
}
</style>
