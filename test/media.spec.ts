import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { COARSE_POINTER, useMediaQuery } from '../src/lib/media.js'

type Listener = (e: MediaQueryListEvent) => void

/** A matchMedia whose answer we can flip, so the change path is testable. */
function fakeMatchMedia(matches: boolean) {
  const listeners: Listener[] = []
  const list = {
    matches,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: (_: string, fn: Listener) => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  return {
    list,
    listeners,
    flip(next: boolean) {
      list.matches = next
      for (const fn of [...listeners]) fn({ matches: next } as MediaQueryListEvent)
    },
  }
}

const probe = (query: string) => {
  const seen: { value: boolean } = { value: false }
  const Probe = defineComponent({
    setup() {
      const m = useMediaQuery(query)
      return () => {
        seen.value = m.value
        return h('i')
      }
    },
  })
  return { Probe, seen }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMediaQuery', () => {
  it('answers with the query the environment reports', () => {
    // happy-dom evaluates real queries: a 1024px window is not 500px wide.
    const { Probe, seen } = probe('(max-width: 500px)')
    mount(Probe)
    expect(seen.value).toBe(false)
    const wide = probe('(min-width: 500px)')
    mount(wide.Probe)
    expect(wide.seen.value).toBe(true)
  })

  it('tracks changes and drops its listener when the component goes', async () => {
    const media = fakeMatchMedia(false)
    vi.stubGlobal('matchMedia', () => media.list)
    const { Probe, seen } = probe(COARSE_POINTER)
    const w = mount(Probe)
    expect(seen.value).toBe(false)

    media.flip(true)
    await w.vm.$nextTick()
    expect(seen.value).toBe(true)

    w.unmount()
    expect(media.listeners).toHaveLength(0)
  })

  it('reads false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { Probe, seen } = probe(COARSE_POINTER)
    mount(Probe)
    expect(seen.value).toBe(false)
  })
})
