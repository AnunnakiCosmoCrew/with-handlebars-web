import { describe, expect, it } from 'vitest'
import { Storage } from 'happy-dom'

// The guard for test/setup-web-storage.ts. Node 25 ships a Web Storage stub on
// the global that shadows happy-dom's, and the stub answers `in` checks without
// answering `clear()` — so every spec that resets persisted state dies with a
// TypeError. Keep this passing and the whole suite keeps working on Node 22–25.
describe('web storage in the test environment', () => {
  it('gives the global a real happy-dom Storage, not a Node stub', () => {
    expect(localStorage).toBeInstanceOf(Storage)
    expect(sessionStorage).toBeInstanceOf(Storage)
    expect(window.localStorage).toBe(localStorage)
    expect(window.sessionStorage).toBe(sessionStorage)
  })

  it('round-trips and clears, which is what the specs lean on', () => {
    localStorage.setItem('handlebars:probe', 'x')
    expect(localStorage.getItem('handlebars:probe')).toBe('x')
    expect(localStorage.length).toBe(1)
    localStorage.clear()
    expect(localStorage.length).toBe(0)
    expect(localStorage.getItem('handlebars:probe')).toBeNull()
  })
})
