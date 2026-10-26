import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { TUNINGS } from '@anunnakicosmocrew/handlebars'
import TuningPicker from '../src/components/TuningPicker.vue'

const standard = TUNINGS[0]!

// Mounted panels listen on the document, so they have to come back down —
// a leftover listener would close the next test's dialog.
let mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

const mountPicker = () => {
  const w = mount(TuningPicker, {
    props: { modelValue: standard.id, tuning: standard, isCustom: false },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

const openDialog = async () => {
  const w = mountPicker()
  await w.get('.tuning-header').trigger('click')
  return w
}

const press = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }))

describe('TuningPicker', () => {
  it('opens the dialog with the preset list inside', async () => {
    const w = await openDialog()
    expect(w.get('.tuning-header').attributes('aria-expanded')).toBe('true')
    expect(w.find('[role=dialog]').exists()).toBe(true)
    expect(w.findAll('[role=option]')).toHaveLength(TUNINGS.length)
  })

  it('closes on a press outside (UX-04)', async () => {
    // The dialog hosts an inline ComboSelect, which installs no listener of its
    // own — this component owns the trigger, so it owns the dismissal.
    const w = await openDialog()
    press(document.body)
    await w.vm.$nextTick()
    expect(w.find('[role=dialog]').exists()).toBe(false)
  })

  it("stays open on a press on the dialog's own padding", async () => {
    // The press lands outside the inline combo but inside the dialog, and blurs
    // the search box with a null relatedTarget. Closing on that would tear the
    // dialog down under a thumb that was aimed at it.
    const w = await openDialog()
    press(w.get('.tuning-dialog').element)
    // Raised on .combo so it bubbles through both handlers, as the real blur
    // does: the inline list's and this component's.
    await w.get('.combo').trigger('focusout')
    expect(w.find('[role=dialog]').exists()).toBe(true)
  })

  it('closes exactly once when the trigger itself is pressed', async () => {
    // pointerdown lands before click: if the trigger were treated as outside,
    // this would close and then immediately re-open.
    const w = await openDialog()
    const button = w.get('.tuning-header')
    press(button.element)
    await button.trigger('click')
    expect(w.find('[role=dialog]').exists()).toBe(false)
  })

  it('closes when focus tabs away to something outside', async () => {
    const w = await openDialog()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await w.get('.combo').trigger('focusout', { relatedTarget: outside })
    expect(w.find('[role=dialog]').exists()).toBe(false)
    outside.remove()
  })

  it('selects a preset, closes, and hands the id up', async () => {
    const w = await openDialog()
    const other = TUNINGS[1]!
    await w.findAll('[role=option]')[1]!.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([[other.id]])
    expect(w.find('[role=dialog]').exists()).toBe(false)
  })
})
