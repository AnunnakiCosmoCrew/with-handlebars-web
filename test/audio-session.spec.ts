import { describe, expect, it } from 'vitest'
import { claimPlaybackSession, type AudioSessionType } from '../src/audio/session.js'

/** Stand in for `navigator.audioSession`, which only WebKit ships. */
const withSession = (session: unknown) => ({ audioSession: session }) as unknown as Navigator

describe('claiming a playback audio session', () => {
  it('asks WebKit for playback, so the ring/silent switch stops muting us', () => {
    const session: { type: AudioSessionType } = { type: 'auto' }
    expect(claimPlaybackSession(withSession(session))).toBe(true)
    expect(session.type).toBe('playback')
  })

  it('leaves an already-claimed session alone', () => {
    let writes = 0
    const session = {
      _type: 'playback' as AudioSessionType,
      get type() {
        return this._type
      },
      set type(value: AudioSessionType) {
        writes += 1
        this._type = value
      },
    }
    expect(claimPlaybackSession(withSession(session))).toBe(true)
    expect(writes).toBe(0)
  })

  it('is a quiet no-op where the API does not exist', () => {
    // Every non-WebKit browser, and the test environment. Not an error: those
    // platforms never muted us in the first place.
    expect(claimPlaybackSession({} as Navigator)).toBe(false)
    expect(claimPlaybackSession(undefined)).toBe(false)
  })

  it('swallows a setter that rejects the type', () => {
    const session = {
      get type(): AudioSessionType {
        return 'auto'
      },
      set type(_value: AudioSessionType) {
        throw new TypeError('nope')
      },
    }
    expect(() => claimPlaybackSession(withSession(session))).not.toThrow()
    expect(claimPlaybackSession(withSession(session))).toBe(false)
  })

  it('reports failure when the assignment is silently ignored', () => {
    const session = { get type(): AudioSessionType { return 'auto' }, set type(_v: AudioSessionType) {} }
    expect(claimPlaybackSession(withSession(session))).toBe(false)
  })
})
