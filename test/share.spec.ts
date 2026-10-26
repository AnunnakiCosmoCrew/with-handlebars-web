import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATE, parseLocation, type RoomState } from '../src/lib/url-state.js'
import { SITE_ORIGIN, canShareBoard, permalink, shareBoard } from '../src/lib/share.js'

const share = vi.fn()
vi.mock('@capacitor/share', () => ({ Share: { share: (o: unknown) => share(o) } }))

const state = (over: Partial<RoomState> = {}): RoomState => ({ ...DEFAULT_STATE, ...over })

const stubNativeShell = () => {
  Object.assign(window, {
    Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  })
}

const stubNavigator = (over: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(over)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
  }
}

beforeEach(() => {
  share.mockReset().mockResolvedValue({ activityType: '' })
})

afterEach(() => {
  Reflect.deleteProperty(window, 'Capacitor')
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('permalink', () => {
  it('names a default board explicitly instead of sending the bare site', () => {
    // The bare site opens the recipient's own last board, not the sender's.
    expect(permalink(state())).toBe(`${SITE_ORIGIN}/standard/e/chord/major/`)
  })

  it("is a tier-1 board's own page, with the lenses as a query (HB-153)", () => {
    expect(permalink(state({ root: 'A', chordId: 'm7', octaves: 'on' }))).toBe(
      `${SITE_ORIGIN}/standard/a/chord/minor-7/?octaves=on`,
    )
  })

  it('carries a board without a page in the query', () => {
    expect(permalink(state({ root: 'Db', chordId: 'maj7', tuningId: 'drop-d' }))).toBe(
      `${SITE_ORIGIN}/?root=Db&chord=maj7&tuning=drop-d`,
    )
  })

  it("round-trips through the room's own parser", () => {
    const board = state({ mode: 'scale', root: 'A', scaleId: 'pentatonic-minor', fretCount: 24 })
    const url = new URL(permalink(board))
    expect(parseLocation(url.pathname, url.search)).toMatchObject({
      mode: 'scale',
      root: 'A',
      scaleId: 'pentatonic-minor',
      fretCount: 24,
    })
  })

  it('never points at the shell it was built in', () => {
    stubNativeShell()
    expect(permalink(state())).toContain('https://withhandlebars.com')
  })
})

describe('shareBoard', () => {
  it('opens the native sheet inside the app', async () => {
    stubNativeShell()
    await expect(shareBoard({ title: 'A minor pentatonic', url: 'https://x/?a=1' })).resolves.toBe(
      'shared',
    )
    // No `text`: iOS hands the text, not the link, to Copy and to plain-text
    // targets — the board's name would arrive with no way back to the board.
    expect(share).toHaveBeenCalledWith({
      title: 'A minor pentatonic',
      url: 'https://x/?a=1',
      dialogTitle: 'Share this board',
    })
  })

  it('treats a dismissed sheet as a finished share', async () => {
    stubNativeShell()
    share.mockRejectedValue(Object.assign(new Error('canceled'), { name: 'AbortError' }))
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('shared')
  })

  it('treats a bridge cancellation object as a finished share', async () => {
    stubNativeShell()
    // Not an Error: the bridge hands back a plain object shaped like one.
    share.mockRejectedValue({ message: 'Share canceled' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ clipboard: { writeText } })
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('shared')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('treats a DOMException abort on the web as a finished share', async () => {
    const webShare = vi.fn().mockRejectedValue(new DOMException('The user aborted', 'AbortError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share: webShare, clipboard: { writeText } })
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('shared')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when the native sheet breaks', async () => {
    stubNativeShell()
    share.mockRejectedValue(new Error('no activity view controller'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ clipboard: { writeText } })
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x/')
  })

  it('uses the browser sheet on the web', async () => {
    const webShare = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share: webShare })
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('shared')
    expect(webShare).toHaveBeenCalledWith({ title: 'A', url: 'https://x/' })
    expect(share).not.toHaveBeenCalled()
  })

  it('copies where no sheet exists', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ clipboard: { writeText } })
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('copied')
  })

  it('reports nothing happened when neither exists', async () => {
    // happy-dom ships a clipboard of its own; a browser without one is the case.
    stubNavigator({ share: undefined, clipboard: undefined })
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('unavailable')
  })

  it('reports nothing happened when the clipboard is refused', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(shareBoard({ title: 'A', url: 'https://x/' })).resolves.toBe('unavailable')
  })
})

describe('canShareBoard', () => {
  it('is true in the app, sheet or no sheet', () => {
    stubNativeShell()
    expect(canShareBoard()).toBe(true)
  })

  it('is true on a web page with a sheet or a clipboard', () => {
    stubNavigator({ share: vi.fn() })
    expect(canShareBoard()).toBe(true)
  })

  it('is false with neither', () => {
    stubNavigator({ share: undefined, clipboard: undefined })
    expect(canShareBoard()).toBe(false)
  })
})
