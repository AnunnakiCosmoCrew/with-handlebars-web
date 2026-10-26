import { beforeEach, describe, expect, it, vi } from 'vitest'

const keepAwake = vi.fn(async () => {})
const allowSleep = vi.fn(async () => {})

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: () => keepAwake(),
    allowSleep: () => allowSleep(),
  },
}))

/**
 * The module holds its state at module scope — one hold per app, not per
 * caller — so each case needs its own copy of it.
 */
async function freshModule() {
  vi.resetModules()
  return await import('../src/lib/keep-awake.js')
}

/** Let the queued plugin promises land; nothing here uses fake timers. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('keeping the screen awake', () => {
  it('holds the screen while asked, and lets it sleep after', async () => {
    const { keepScreenAwake } = await freshModule()
    keepScreenAwake(true)
    await flush()
    expect(keepAwake).toHaveBeenCalledTimes(1)
    expect(allowSleep).not.toHaveBeenCalled()
    keepScreenAwake(false)
    await flush()
    expect(allowSleep).toHaveBeenCalledTimes(1)
  })

  it('asks the device only when the answer changes', async () => {
    const { keepScreenAwake } = await freshModule()
    keepScreenAwake(true)
    await flush()
    keepScreenAwake(true)
    keepScreenAwake(true)
    await flush()
    expect(keepAwake).toHaveBeenCalledTimes(1)
  })

  it('settles on the last intent when toggles outrun the plugin', async () => {
    // Stopping and restarting the metronome inside one tick must not leave the
    // hold released — the calls are promises, the toggles are not.
    const { keepScreenAwake } = await freshModule()
    keepScreenAwake(true)
    keepScreenAwake(false)
    keepScreenAwake(true)
    await flush()
    expect(keepAwake).toHaveBeenCalledTimes(1)
    expect(allowSleep).not.toHaveBeenCalled()
  })

  it('walks all the way back when the last intent is release', async () => {
    const { keepScreenAwake } = await freshModule()
    keepScreenAwake(true)
    keepScreenAwake(false)
    await flush()
    expect(keepAwake).toHaveBeenCalledTimes(1)
    expect(allowSleep).toHaveBeenCalledTimes(1)
  })

  it('gives up quietly where there is no wake lock, and stops asking', async () => {
    keepAwake.mockRejectedValueOnce(new Error('Screen Wake Lock API not available'))
    const { keepScreenAwake } = await freshModule()
    keepScreenAwake(true)
    await flush()
    expect(keepAwake).toHaveBeenCalledTimes(1)
    // A browser without the API would otherwise throw once per toggle, forever.
    keepScreenAwake(false)
    keepScreenAwake(true)
    await flush()
    expect(keepAwake).toHaveBeenCalledTimes(1)
    expect(allowSleep).not.toHaveBeenCalled()
  })
})
