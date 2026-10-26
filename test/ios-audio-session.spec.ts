// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appDelegate = readFileSync(resolve('ios/App/App/AppDelegate.swift'), 'utf8')
/** The same file with its comments dropped, for assertions about actual code. */
const appDelegateCode = appDelegate
  .split('\n')
  .filter(line => !line.trim().startsWith('//'))
  .join('\n')

// The app's own audio session is a declaration of intent — the notes come from
// Web Audio, which asks for the same thing in src/audio/session.ts. It is also
// twenty lines in a file Capacitor regenerates on a fresh `cap add ios`, and
// losing it is silent. Guard the claim ADR-0003 makes to App Review.
describe('the iOS audio session', () => {
  it('declares the playback category, so the app sounds under the silent switch', () => {
    expect(appDelegate).toContain('import AVFoundation')
    expect(appDelegate).toMatch(/setCategory\(\s*\.playback/)
  })

  it('asks again after an interruption and after a media services reset', () => {
    expect(appDelegate).toContain('AVAudioSession.interruptionNotification')
    expect(appDelegate).toContain('AVAudioSession.mediaServicesWereResetNotification')
  })

  it('does not activate the session at launch', () => {
    // Activating is what interrupts other apps. At launch the user has not
    // asked for a note yet; WebKit activates when audio actually starts.
    expect(appDelegateCode).not.toContain('setActive')
  })

  it('claims no background audio, which would need an entitlement we do not want', () => {
    const infoPlist = readFileSync(resolve('ios/App/App/Info.plist'), 'utf8')
    expect(infoPlist).not.toContain('UIBackgroundModes')
  })
})
