// Node 25 turned the Web Storage API on by default, so `globalThis.localStorage`
// already exists — as a Node stub with no `clear`/`getItem`/`setItem` — before the
// test environment boots. Vitest's happy-dom environment only copies a window
// property onto the global when the global doesn't already have it (or when the
// key is on its own hard-coded list, which storage is not), so on Node 25 the stub
// wins and every spec that resets state dies on `localStorage.clear is not a
// function`. On Node 22–24 the flag is off, the stub is absent, and happy-dom's
// storage installs normally.
//
// Rather than branch on the Node version, hand every test file a fresh happy-dom
// Storage: same object on every supported Node, and the per-file instance matches
// the isolation happy-dom's own window-attached storage gives.
import { Storage } from 'happy-dom'

for (const key of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, key, {
    value: new Storage(),
    configurable: true,
    writable: true,
  })
}
