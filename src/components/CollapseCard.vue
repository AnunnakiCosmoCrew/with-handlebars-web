<script setup lang="ts">
defineProps<{
  /** Header label; also all that's left when the card is collapsed. */
  title: string
  open: boolean
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <section class="ccard" :class="{ 'ccard-open': open }">
    <button
      type="button"
      class="ccard-head"
      :aria-expanded="open"
      :data-card="title"
      @click="$emit('toggle')"
    >
      <svg class="ccard-chevron" :class="{ 'ccard-chevron-open': open }" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" />
      </svg>
      {{ title }}
    </button>
    <div v-if="open" class="ccard-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.ccard {
  border: 1px solid var(--hb-border);
  border-radius: 10px;
  background: var(--hb-surface);
  margin: 1rem 0;
}

.ccard-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.55rem 0.9rem;
  font: inherit;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
  color: var(--hb-muted);
  background: none;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
}

.ccard-head:hover {
  color: var(--hb-text);
}

.ccard-chevron {
  width: 10px;
  height: 10px;
  flex: none;
  transition: transform 0.12s ease-out;
}

.ccard-chevron-open {
  transform: rotate(90deg);
}

.ccard-body {
  padding: 0 0.9rem 0.8rem;
}
</style>
