import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ComboSelect from '../src/components/ui/ComboSelect.vue'

const options = [
  { value: 'a', label: 'Alpha', sublabel: 'first' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

const mountCombo = (props: Record<string, unknown> = {}) =>
  mount(ComboSelect, {
    props: { modelValue: 'a', options, label: 'Test picker', ...props },
    attachTo: document.body,
  })

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

  it('inline mode renders open without a button and emits dismiss on Escape', async () => {
    const w = mountCombo({ inline: true, searchable: true })
    expect(w.find('[role=combobox]').exists()).toBe(false)
    expect(w.find('[role=listbox]').exists()).toBe(true)
    await w.get('input').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('dismiss')).toHaveLength(1)
  })
})
