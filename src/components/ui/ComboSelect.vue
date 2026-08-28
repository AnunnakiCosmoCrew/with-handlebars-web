<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

export type ComboOption = {
  value: string
  label: string
  sublabel?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: ComboOption[]
    /** Text on the closed button; defaults to the selected option's label. */
    buttonLabel?: string
    searchable?: boolean
    searchPlaceholder?: string
    label: string
    /** Render the list permanently open with no trigger button (for dialogs). */
    inline?: boolean
  }>(),
  {
    buttonLabel: undefined,
    searchable: false,
    searchPlaceholder: 'Search…',
    inline: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** Inline mode only: Escape or focus loss asks the host to dismiss. */
  dismiss: []
}>()

const uid = `combo-${Math.random().toString(36).slice(2, 9)}`
const open = ref(false)
const search = ref('')
const activeIndex = ref(0)
const rootEl = ref<HTMLElement>()
const buttonEl = ref<HTMLButtonElement>()
const searchEl = ref<HTMLInputElement>()
const listEl = ref<HTMLElement>()

const selected = computed(() => props.options.find(o => o.value === props.modelValue))
const display = computed(() => props.buttonLabel ?? selected.value?.label ?? '')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter(o =>
    `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(q),
  )
})

watch(filtered, () => {
  activeIndex.value = 0
})

async function openList() {
  open.value = true
  search.value = ''
  await nextTick()
  const i = props.options.findIndex(o => o.value === props.modelValue)
  activeIndex.value = Math.max(0, i)
  ;(props.searchable ? searchEl.value : listEl.value)?.focus()
  scrollActiveIntoView()
}

function close(refocus = true) {
  if (props.inline) {
    emit('dismiss')
    return
  }
  if (!open.value) return
  open.value = false
  if (refocus) buttonEl.value?.focus()
}

onMounted(() => {
  if (props.inline) void openList()
})

function select(value: string) {
  emit('update:modelValue', value)
  close()
}

function move(delta: number) {
  const n = filtered.value.length
  if (!n) return
  activeIndex.value = Math.min(n - 1, Math.max(0, activeIndex.value + delta))
  scrollActiveIntoView()
}

function scrollActiveIntoView() {
  const el = document.getElementById(`${uid}-opt-${activeIndex.value}`)
  el?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      break
    case 'Home':
      e.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      e.preventDefault()
      activeIndex.value = filtered.value.length - 1
      scrollActiveIntoView()
      break
    case 'Enter': {
      e.preventDefault()
      const opt = filtered.value[activeIndex.value]
      if (opt) select(opt.value)
      break
    }
    case 'Escape':
      e.preventDefault()
      close()
      break
    case 'Tab':
      close(false)
      break
  }
}

function onButtonKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    void openList()
  }
}

function onFocusout(e: FocusEvent) {
  if (!rootEl.value?.contains(e.relatedTarget as Node)) close(false)
}
</script>

<template>
  <div ref="rootEl" class="combo" :class="{ inline }" @focusout="onFocusout">
    <button
      v-if="!inline"
      ref="buttonEl"
      type="button"
      class="combo-button"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="`${uid}-list`"
      :aria-label="label"
      aria-haspopup="listbox"
      @click="open ? close() : openList()"
      @keydown="onButtonKeydown"
    >
      <slot name="button" :selected="selected">{{ display }}</slot>
      <span class="combo-caret" aria-hidden="true">▾</span>
    </button>
    <div v-if="open || inline" class="combo-panel" :class="{ 'combo-panel-inline': inline }">
      <input
        v-if="searchable"
        ref="searchEl"
        v-model="search"
        class="combo-search"
        type="text"
        :placeholder="searchPlaceholder"
        :aria-label="`${label} search`"
        :aria-activedescendant="filtered.length ? `${uid}-opt-${activeIndex}` : undefined"
        aria-autocomplete="list"
        :aria-controls="`${uid}-list`"
        @keydown="onKeydown"
      />
      <ul
        :id="`${uid}-list`"
        ref="listEl"
        class="combo-list"
        role="listbox"
        :tabindex="searchable ? -1 : 0"
        :aria-label="label"
        :aria-activedescendant="filtered.length ? `${uid}-opt-${activeIndex}` : undefined"
        @keydown="searchable ? undefined : onKeydown($event)"
      >
        <li
          v-for="(o, i) in filtered"
          :id="`${uid}-opt-${i}`"
          :key="o.value"
          role="option"
          class="combo-option"
          :class="{ active: i === activeIndex }"
          :aria-selected="o.value === modelValue"
          @mousedown.prevent
          @click="select(o.value)"
          @mousemove="activeIndex = i"
        >
          <span class="combo-option-label">{{ o.label }}</span>
          <span v-if="o.sublabel" class="combo-option-sublabel">{{ o.sublabel }}</span>
        </li>
      </ul>
      <div v-if="!filtered.length" class="combo-empty">No matches</div>
    </div>
  </div>
</template>

<style scoped>
.combo {
  position: relative;
  display: inline-block;
}

.combo-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  font: inherit;
  background: var(--hb-control-bg);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  cursor: pointer;
}

.combo-caret {
  font-size: 0.7em;
  color: var(--hb-muted);
}

.combo-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  left: 0;
  min-width: max(100%, 14rem);
  background: var(--hb-surface);
  border: 1px solid var(--hb-border);
  border-radius: 8px;
  box-shadow: 0 6px 24px var(--hb-shadow);
  padding: 0.4rem;
}

.combo-panel-inline {
  position: static;
  box-shadow: none;
  border: none;
  padding: 0;
}

.combo-search {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.4rem;
  padding: 0.35rem 0.5rem;
  font: inherit;
  border: 1px solid var(--hb-border);
  border-radius: 6px;
}

.combo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 16rem;
  overflow-y: auto;
  outline: none;
}

.combo-option {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
}

.combo-option.active {
  background: var(--hb-active-bg);
}

.combo-option[aria-selected='true'] .combo-option-label {
  font-weight: 700;
}

.combo-option-sublabel {
  font-size: 0.8em;
  color: var(--hb-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combo-empty {
  padding: 0.35rem 0.5rem;
  color: var(--hb-muted);
}
</style>
