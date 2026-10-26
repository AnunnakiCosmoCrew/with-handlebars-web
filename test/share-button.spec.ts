import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareButton from '../src/components/ShareButton.vue'

/**
 * The Share control: what it hands over, and what it says back. Which sheet
 * receives it is test/share.spec.ts's business.
 */

const mountButton = () => mount(ShareButton, { global: { plugins: [createPinia()] } })

const stubNavigator = (over: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(over)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
  }
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('share button', () => {
  it('shares the board on screen as a site permalink', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share })
    history.replaceState(null, '', '/?root=A&scale=pentatonic-minor&frets=24')

    const w = mountButton()
    await w.get('[data-share]').trigger('click')

    expect(share).toHaveBeenCalledTimes(1)
    const payload = share.mock.calls[0]?.[0] as { title: string; url: string }
    expect(payload.url).toBe('https://withhandlebars.com/standard/a/scale/pentatonic-minor/?frets=24')
    // The board's own name, so the sheet says what is being handed over.
    expect(payload.title).toBe('A Pentatonic Minor')
    expect(w.text()).not.toContain('Link copied')
  })

  it('says so when the link only reached the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ clipboard: { writeText } })

    const w = mountButton()
    await w.get('[data-share]').trigger('click')
    await w.vm.$nextTick()

    expect(writeText).toHaveBeenCalledWith('https://withhandlebars.com/standard/e/chord/major/')
    expect(w.text()).toContain('Link copied')
  })

  it('stays away where there is nothing to share with', () => {
    stubNavigator({ share: undefined, clipboard: undefined })
    expect(mountButton().find('[data-share]').exists()).toBe(false)
  })
})
