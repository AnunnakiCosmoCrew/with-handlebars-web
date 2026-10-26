import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ComboSelect from '../src/components/ui/ComboSelect.vue'

const options = [
  { value: 'a', label: 'Alpha', sublabel: 'first' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

// Mounted panels listen on the document, so they have to come back down —
// a leftover listener would close the next test's panel.
let mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
  Reflect.deleteProperty(window, 'matchMedia')
})

const mountCombo = (props: Record<string, unknown> = {}) => {
  const w = mount(ComboSelect, {
    props: { modelValue: 'a', options, label: 'Test picker', ...props },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

/** Report a touch screen, whatever the query. happy-dom's own answer is false. */
const stubCoarsePointer = () => {
  Object.assign(window, { matchMedia: () => ({ matches: true }) })
}

const press = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }))

describe('ComboSelect', () => {
  it('renders a closed combobox button with the selected label', () => {
    const w = mountCombo()
    const btn = w.get('[role=combobox]')
    expect(btn.text()).toContain('Alpha')
    expect(btn.attributes('aria-expanded')).toBe('false')
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('opens on click with the selected option active', async () => {
    const w = mountCombo({ modelValue: 'b' })
    await w.get('[role=combobox]').trigger('click')
    expect(w.get('[role=combobox]').attributes('aria-expanded')).toBe('true')
    const opts = w.findAll('[role=option]')
    expect(opts).toHaveLength(3)
    expect(opts[1]!.attributes('aria-selected')).toBe('true')
    expect(opts[1]!.classes()).toContain('active')
  })

  it('navigates with arrows and selects with Enter', async () => {
    const w = mountCombo()
    await w.get('[role=combobox]').trigger('click')
    const list = w.get('[role=listbox]')
    await list.trigger('keydown', { key: 'ArrowDown' })
    await list.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')).toEqual([['b']])
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('closes on Escape without selecting', async () => {
    const w = mountCombo()
    await w.get('[role=combobox]').trigger('click')
    await w.get('[role=listbox]').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('filters via the search box', async () => {
    const w = mountCombo({ searchable: true })
    await w.get('[role=combobox]').trigger('click')
    const input = w.get('input[aria-autocomplete=list]')
    await input.setValue('gam')
    expect(w.findAll('[role=option]').map(o => o.text())).toEqual(['Gamma'])
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')).toEqual([['c']])
  })

  it('searches sublabels too', async () => {
    const w = mountCombo({ searchable: true })
    await w.get('[role=combobox]').trigger('click')
    await w.get('input').setValue('first')
    expect(w.findAll('[role=option]').map(o => o.attributes('id'))).toHaveLength(1)
  })

  it('shows an empty state outside the listbox and drops aria-activedescendant', async () => {
    const w = mountCombo({ searchable: true })
    await w.get('[role=combobox]').trigger('click')
    await w.get('input').setValue('zzz')
    expect(w.text()).toContain('No matches')
    // Listbox children must all be options; the empty state lives outside it.
    expect(w.get('[role=listbox]').element.children).toHaveLength(0)
    expect(w.get('input').attributes('aria-activedescendant')).toBeUndefined()
    expect(w.get('[role=listbox]').attributes('aria-activedescendant')).toBeUndefined()
  })

  it('selects on option click', async () => {
    const w = mountCombo()
    await w.get('[role=combobox]').trigger('click')
    await w.findAll('[role=option]')[2]!.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['c']])
  })

  it('closes on a press outside, and stays open on one inside (UX-04)', async () => {
    // iOS does not blur an input when you tap non-focusable space, so focusout
    // alone left the picker with no way out but the keyboard's Done button.
    const w = mountCombo()
    await w.get('[role=combobox]').trigger('click')
    press(w.get('.combo-panel').element)
    await w.vm.$nextTick()
    expect(w.find('[role=listbox]').exists()).toBe(true)
    press(document.body)
    await w.vm.$nextTick()
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('closes exactly once when the trigger itself is pressed', async () => {
    // pointerdown lands before click. If the outside-close did not treat the
    // trigger as inside, it would close here and the click would re-open —
    // making the trigger useless for closing.
    const w = mountCombo()
    await w.get('[role=combobox]').trigger('click')
    const button = w.get('[role=combobox]')
    press(button.element)
    await button.trigger('click')
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('stays open when focus leaves for nowhere', async () => {
    // Tapping the panel's own padding blurs with a null relatedTarget; closing
    // on that tears the panel down under a press that was aimed at it.
    const w = mountCombo()
    await w.get('[role=combobox]').trigger('click')
    await w.get('.combo').trigger('focusout')
    expect(w.find('[role=listbox]').exists()).toBe(true)
  })

  it('closes when focus tabs away to something outside', async () => {
    const w = mountCombo()
    await w.get('[role=combobox]').trigger('click')
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await w.get('.combo').trigger('focusout', { relatedTarget: outside })
    expect(w.find('[role=listbox]').exists()).toBe(false)
    outside.remove()
  })

  it('leaves an outside press to the host in inline mode', async () => {
    // The host owns the dialog and its dismissal (TuningPicker). A second
    // listener here would dismiss on a press on the host's own trigger, and the
    // click that followed would re-open it.
    const w = mountCombo({ inline: true, searchable: true })
    press(document.body)
    await w.vm.$nextTick()
    expect(w.emitted('dismiss')).toBeUndefined()
  })

  it('autofocuses the search box on a fine pointer', async () => {
    const w = mountCombo({ searchable: true })
    await w.get('[role=combobox]').trigger('click')
    expect(document.activeElement).toBe(w.get('input[aria-autocomplete=list]').element)
  })

  it('focuses the list instead on a touch screen, raising no keyboard (UX-03)', async () => {
    stubCoarsePointer()
    const w = mountCombo({ searchable: true })
    await w.get('[role=combobox]').trigger('click')
    expect(w.find('input[aria-autocomplete=list]').exists()).toBe(true)
    expect(document.activeElement).toBe(w.get('[role=listbox]').element)
  })

  it('inline mode renders open without a button and emits dismiss on Escape', async () => {
    const w = mountCombo({ inline: true, searchable: true })
    expect(w.find('[role=combobox]').exists()).toBe(false)
    expect(w.find('[role=listbox]').exists()).toBe(true)
    await w.get('input').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('dismiss')).toHaveLength(1)
  })
})
