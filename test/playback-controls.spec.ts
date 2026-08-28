import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { play, stop } = vi.hoisted(() => ({
  play: vi.fn(async () => 0.5),
  stop: vi.fn(),
}))
vi.mock('../src/audio/engine.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/audio/engine.js')>()
  return { ...actual, audioEngine: { play, stop } }
})

import PlaybackControls from '../src/components/PlaybackControls.vue'
import { useRoomStore } from '../src/stores/room.js'

function mountControls() {
  setActivePinia(createPinia())
  const store = useRoomStore()
  return { w: mount(PlaybackControls), store }
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  play.mockClear()
  stop.mockClear()
})

describe('PlaybackControls', () => {
  it('plays the current selection with instrument and speed', async () => {
    const { w, store } = mountControls()
    store.instrument = 'steel'
    store.speed = 4
    await w.get('button.play-button').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledWith(
      { midi: [52, 56, 59], kind: 'strum' },
      'steel',
      4,
    )
  })

  it('turns into a Stop button while playing', async () => {
    const { w } = mountControls()
    await w.get('button.play-button').trigger('click')
    await flushPromises()
    expect(w.get('button.play-button').text()).toContain('Stop')
    await w.get('button.play-button').trigger('click')
    expect(stop).toHaveBeenCalled()
    expect(w.get('button.play-button').text()).toContain('Play')
  })

  it('ignores clicks while loading and labels the state for screen readers', async () => {
    let release!: (v: number) => void
    play.mockImplementationOnce(() => new Promise<number>(r => (release = r)))
    const { w } = mountControls()
    const btn = w.get('button.play-button')
    await btn.trigger('click')
    expect(btn.attributes('aria-label')).toBe('Loading instrument')
    await btn.trigger('click')
    await btn.trigger('click')
    expect(play).toHaveBeenCalledTimes(1)
    release(0.5)
    await flushPromises()
    expect(btn.attributes('aria-label')).toBe('Stop')
  })

  it('shows an error state when audio fails', async () => {
    play.mockRejectedValueOnce(new Error('no audio'))
    const { w } = mountControls()
    await w.get('button.play-button').trigger('click')
    await flushPromises()
    expect(w.find('[role=alert]').text()).toContain('Audio unavailable')
  })

  it('binds the speed slider to the store', async () => {
    const { w, store } = mountControls()
    const slider = w.get('input[type=range]')
    expect(slider.attributes('min')).toBe('0')
    expect(slider.attributes('max')).toBe('4')
    await slider.setValue('1')
    expect(store.speed).toBe(1)
  })

  it('offers the four instruments', async () => {
    const { w } = mountControls()
    await w.get('[role=combobox]').trigger('click')
    expect(w.findAll('[role=option]')).toHaveLength(4)
  })
})
