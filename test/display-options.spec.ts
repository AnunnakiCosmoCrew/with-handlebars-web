import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import DisplayOptions from '../src/components/DisplayOptions.vue'

// Mounted panels listen on the document, so they have to come back down —
// a leftover listener would close the next test's panel.
let mounted: ReturnType<typeof mount>[] = []

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

const openPanel = async () => {
  const w = mount(DisplayOptions, { attachTo: document.body })
  mounted.push(w)
  await w.find('.display-button').trigger('click')
  return w
}

describe('DisplayOptions', () => {
  it('opens the panel and writes each setting to the store', async () => {
    const store = useRoomStore()
    const w = await openPanel()
    expect(w.find('.display-panel').exists()).toBe(true)
    expect(w.findAll('fieldset')).toHaveLength(8)
    await w.find('input[name="hb-labels"][value="intervals"]').setValue()
    expect(store.labelMode).toBe('intervals')
  })

  it('stays open when focus leaves for nowhere — the click on a label', async () => {
    const store = useRoomStore()
    const w = await openPanel()
    // Pressing a label blurs the button before the browser has handed focus
    // to the input, so focusout arrives with no relatedTarget…
    await w.find('.display-options').trigger('focusout')
    expect(w.find('.display-panel').exists()).toBe(true)
    // …and the click that follows still finds its radio.
    await w.find('input[name="hb-labels"][value="intervals"]').setValue()
    expect(store.labelMode).toBe('intervals')
  })

  it('closes when focus tabs away to something outside', async () => {
    const w = await openPanel()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await w.find('.display-options').trigger('focusout', { relatedTarget: outside })
    expect(w.find('.display-panel').exists()).toBe(false)
    outside.remove()
  })

  it('closes on a press outside, and stays open on one inside', async () => {
    const w = await openPanel()
    w.find('.display-panel').element.dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    )
    await w.vm.$nextTick()
    expect(w.find('.display-panel').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.find('.display-panel').exists()).toBe(false)
  })

  it('closes on escape', async () => {
    const w = await openPanel()
    await w.find('.display-panel').trigger('keydown.escape')
    expect(w.find('.display-panel').exists()).toBe(false)
  })
})
