import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ModeToggle from '../src/components/ModeToggle.vue'

const mountToggle = () =>
  mount(ModeToggle, {
    props: {
      modelValue: 'chord' as const,
      'onUpdate:modelValue': async (v: 'chord' | 'scale') => {
        await w.setProps({ modelValue: v })
      },
    },
    attachTo: document.body,
  })
let w: ReturnType<typeof mountToggle>

describe('ModeToggle', () => {
  it('is a radiogroup with roving tabindex', () => {
    w = mountToggle()
    const radios = w.findAll('[role=radio]')
    expect(radios).toHaveLength(2)
    expect(radios[0]!.attributes('tabindex')).toBe('0')
    expect(radios[1]!.attributes('tabindex')).toBe('-1')
  })

  it('moves selection AND focus on arrow keys', async () => {
    w = mountToggle()
    const group = w.get('[role=radiogroup]')
    await group.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    const scaleBtn = w.findAll('[role=radio]')[1]!
    expect(scaleBtn.attributes('aria-checked')).toBe('true')
    expect(scaleBtn.attributes('tabindex')).toBe('0')
    expect(document.activeElement).toBe(scaleBtn.element)
    await group.trigger('keydown', { key: 'ArrowUp' })
    await nextTick()
    expect(document.activeElement).toBe(w.findAll('[role=radio]')[0]!.element)
  })
})
