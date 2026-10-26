// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Since Chrome 152 a `chrome --headless --screenshot` writes its PNG and then
// never exits, so a script that waits on the process hangs after its work is
// done. tools/render-lib.sh waits on the output instead. These two checks are
// what stop the next renderer — or a tidy-up of one of these — from quietly
// going back to waiting on the browser.
const cliRenderers = ['og', 'icon', 'splash']

const read = (file: string) => readFileSync(resolve('tools', file), 'utf8')

describe('the render scripts', () => {
  it.each(cliRenderers)('render-%s.sh takes its screenshots through the helper', name => {
    const script = read(`render-${name}.sh`)
    expect(script).toContain('. tools/render-lib.sh')
    expect(script).toContain('shoot_png ')
  })

  // Comments stripped first: render-shots.sh explains at the top that it does
  // *not* take its grabs this way, and a plain substring search reads that
  // sentence as the very thing it is disclaiming.
  const code = (file: string) =>
    read(file)
      .split('\n')
      .filter(line => !/^\s*#/.test(line))
      .join('\n')

  it('leaves --screenshot to the helper alone', () => {
    const scripts = readdirSync(resolve('tools')).filter(
      f => f.startsWith('render-') && f.endsWith('.sh') && f !== 'render-lib.sh',
    )
    expect(scripts.length).toBeGreaterThanOrEqual(cliRenderers.length)
    for (const file of scripts) {
      expect(code(file), `${file} drives --screenshot itself`).not.toContain('--screenshot')
    }
  })
})
