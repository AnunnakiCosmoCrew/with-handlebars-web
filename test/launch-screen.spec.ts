// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The launch storyboard is hand-written XML that nothing else in the suite
// compiles, and its failure mode is silent: a wrong reference just draws a
// black screen on launch. These are the assertions that would have caught each
// way of getting it wrong.
const storyboard = readFileSync(
  resolve('ios/App/App/Base.lproj/LaunchScreen.storyboard'),
  'utf8',
)

describe('LaunchScreen.storyboard', () => {
  it('is still a launch screen, safe areas and all', () => {
    expect(storyboard).toContain('launchScreen="YES"')
    expect(storyboard).toContain('useSafeAreas="YES"')
  })

  // Capacitor's stock file makes the view controller's *view* an image view,
  // which is why it has no constraints and can't centre anything. That shape
  // must not come back.
  it('is a plain view, not an image view wearing one', () => {
    expect(storyboard).toContain('<view key="view"')
    expect(storyboard).not.toContain('<imageView key="view"')
  })

  it('paints the plate with the colour set', () => {
    expect(storyboard).toContain('<color key="backgroundColor" name="SplashBackground"/>')
    expect(storyboard).not.toContain('systemColor=')
  })

  it('centres the mark at its own size', () => {
    expect(storyboard).toMatch(/image="SplashMark"/)
    expect(storyboard).toMatch(/contentMode="scaleAspectFit"/)
    expect(storyboard).toMatch(/translatesAutoresizingMaskIntoConstraints="NO"/)
    expect(storyboard).toMatch(/firstAttribute="centerX"/)
    expect(storyboard).toMatch(/firstAttribute="centerY"/)
    expect(storyboard).toMatch(/firstAttribute="width" constant="128"/)
    expect(storyboard).toMatch(/firstAttribute="height" constant="128"/)
  })

  // The <resources> block is Xcode's own record of what the document expects.
  // If it disagrees with the constraints, the canvas lies about the layout.
  it('declares the mark at the size it constrains it to', () => {
    expect(storyboard).toContain('<image name="SplashMark" width="128" height="128"/>')
  })

  it('has forgotten Capacitor\'s stock splash', () => {
    expect(storyboard).not.toMatch(/image="Splash"/)
    expect(storyboard).not.toContain('Splash.imageset')
    expect(existsSync(resolve('ios/App/App/Assets.xcassets/Splash.imageset'))).toBe(false)
  })

  // A duplicated Interface Builder id is the classic hand-edited-storyboard
  // mistake, and Xcode's complaint about it names neither id.
  it('gives every object its own id', () => {
    const ids = [...storyboard.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Info.plist', () => {
  const plist = readFileSync(resolve('ios/App/App/Info.plist'), 'utf8')

  it('still launches through the storyboard', () => {
    expect(plist).toMatch(
      /<key>UILaunchStoryboardName<\/key>\s*<string>LaunchScreen<\/string>/,
    )
  })

  // Setting this to Light or Dark pins the app to one appearance, and half of
  // the launch screen — the whole dark plate — becomes dead art. It is exactly
  // the key someone reaches for to fix an unrelated status-bar problem.
  it('leaves the appearance to the system', () => {
    expect(plist).not.toContain('UIUserInterfaceStyle')
  })
})
