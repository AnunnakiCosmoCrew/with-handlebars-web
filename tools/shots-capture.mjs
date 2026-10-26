// The camera behind tools/render-shots.sh. Given a JSON job on stdin it drives
// one headless Chrome over the DevTools protocol and writes one PNG per shot.
//
// Why not `chrome --headless --screenshot`, which is how the other three
// renderers work: Chrome floors a window at 500 CSS px, so --window-size=440
// lays the page out at 500 and the screenshot is a 440-wide crop of it — the
// right-hand gutter missing, and the room measuring a phone it isn't. Two of
// the three slots here are narrower than that floor. Emulation.setDeviceMetrics
// Override has no such floor, takes the device scale factor and the mobile flag
// in the same call, and reports the size back so it can be checked rather than
// trusted.
//
// It also fixes something the other three live with: since Chrome 152 the CLI
// writes the PNG and then never exits. Here the connection is ours to close.
//
// No dependency: Node 22 (the engines floor) has both fetch and WebSocket.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const job = JSON.parse(readFileSync(0, 'utf8'))
const profile = await mkdtemp(join(tmpdir(), 'hb-shots-'))

const chrome = spawn(
  job.chrome,
  [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const die = async (message, code = 1) => {
  chrome.kill()
  await rm(profile, { recursive: true, force: true }).catch(() => {})
  if (message) console.error(message)
  process.exit(code)
}

// Chrome writes the port it actually took into the profile once it is listening.
const portFile = join(profile, 'DevToolsActivePort')
let port = ''
for (let i = 0; i < 120 && !port; i++) {
  await sleep(250)
  if (existsSync(portFile)) port = (await readFile(portFile, 'utf8')).split('\n')[0].trim()
}
if (!port) await die('Chrome never opened a DevTools port')

const { webSocketDebuggerUrl } = await (
  await fetch(`http://127.0.0.1:${port}/json/version`)
).json()

const socket = new WebSocket(webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const waiters = []

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) {
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result)
    return
  }
  for (const waiter of [...waiters]) {
    if (waiter.method === message.method && waiter.sessionId === message.sessionId) {
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve(message.params)
    }
  }
})

const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }))
  })

const once = (method, sessionId, timeout = 30000) =>
  new Promise((resolve, reject) => {
    const waiter = { method, sessionId, resolve }
    waiters.push(waiter)
    setTimeout(() => {
      if (waiters.includes(waiter)) {
        waiters.splice(waiters.indexOf(waiter), 1)
        reject(new Error(`timed out waiting for ${method}`))
      }
    }, timeout).unref?.()
  })

for (const shot of job.shots) {
  // A context per shot, not a profile per shot: localStorage is per-context, so
  // one shot's remembered room cannot leak into the next one's picture. (The
  // page clears storage itself as well — see src/shots/harness.ts.)
  const { browserContextId } = await send('Target.createBrowserContext')
  const { targetId } = await send('Target.createTarget', {
    url: 'about:blank',
    browserContextId,
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })

  // mobile: true is what the CLI could not do: it applies the page's own
  // viewport meta and reports a coarse pointer, so the 44pt tap floor in
  // src/style.css is in force — the difference between a picture of the app and
  // a picture of the website at a phone's dimensions.
  await send(
    'Emulation.setDeviceMetricsOverride',
    {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: shot.scale,
      mobile: true,
      screenWidth: shot.width,
      screenHeight: shot.height,
    },
    sessionId,
  )
  // mobile: true alone still reports a mouse. Touch emulation is what makes
  // `(pointer: coarse)` match, and that media query is where the 44pt tap floor
  // lives — so this line is the one that decides whether the shot is of the app
  // or of the website at a phone's dimensions.
  await send(
    'Emulation.setTouchEmulationEnabled',
    { enabled: true, maxTouchPoints: 5 },
    sessionId,
  )
  await send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-color-scheme', value: shot.theme }] },
    sessionId,
  )

  await send('Page.enable', {}, sessionId)
  const loaded = once('Page.loadEventFired', sessionId)
  await send('Page.navigate', { url: shot.url }, sessionId)
  await loaded
  // The board lays out after the first paint and the practice shot scrolls two
  // frames after that; a second of settle covers both with room to spare.
  await sleep(1200)

  // What the page thinks it is, not what we asked for. A device metrics
  // override that silently failed would otherwise cost a whole set.
  const { result } = await send(
    'Runtime.evaluate',
    {
      expression:
        'JSON.stringify({ width: innerWidth, dpr: devicePixelRatio, pointer: document.documentElement.dataset.pointer })',
      returnByValue: true,
    },
    sessionId,
  )
  const seen = JSON.parse(result.value)
  if (seen.width !== shot.width || seen.pointer !== 'coarse') {
    await die(
      `${shot.out}: the page rendered ${seen.width}px wide as pointer: ${seen.pointer},\n` +
        `expected ${shot.width}px and coarse. The emulation override did not take.`,
    )
  }

  const { data } = await send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false, optimizeForSpeed: false },
    sessionId,
  )
  await writeFile(shot.out, Buffer.from(data, 'base64'))

  await send('Target.closeTarget', { targetId })
  await send('Target.disposeBrowserContext', { browserContextId })
  console.error(`captured ${shot.out}`)
}

socket.close()
await die(null, 0)
