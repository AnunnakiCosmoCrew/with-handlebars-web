import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type UrlOpen = (event: { url: string }) => void
let urlOpen: UrlOpen | undefined
const addListener = vi.fn(async (_event: string, fn: UrlOpen) => {
  urlOpen = fn
  return { remove: async () => {} }
})

vi.mock('@capacitor/app', () => ({
  App: { addListener: (event: string, fn: UrlOpen) => addListener(event, fn) },
}))

const { boardLocation, listenForBoardLinks } = await import('../src/lib/universal-links.js')

const here = (search = '') => ({ search })

describe('where an incoming link takes the app', () => {
  it('loads a shared board through the query, as the site would', () => {
    expect(boardLocation('https://withhandlebars.com/?root=G&chord=maj7', here())).toBe(
      '/?root=G&chord=maj7',
    )
  })

  it('stays on the current board for the bare origin', () => {
    // On the site, `/` shows the visitor's own last board; the app keeps its own.
    expect(boardLocation('https://withhandlebars.com/', here('?root=A'))).toBeNull()
  })

  it('does not reload the board already on screen', () => {
    expect(boardLocation('https://withhandlebars.com/?root=A', here('?root=A'))).toBeNull()
  })

  it("opens a board page's link as the room's query for the same board (HB-153)", () => {
    expect(boardLocation('https://withhandlebars.com/standard/a/chord/minor-7/?octaves=on', here())).toBe(
      '/?root=A&chord=m7&octaves=on',
    )
    expect(boardLocation('https://withhandlebars.com/standard/e/chord/major/', here())).toBe('/?root=E')
    expect(
      boardLocation('https://withhandlebars.com/standard/a/chord/minor-7/', here('?root=A&chord=m7')),
    ).toBeNull()
  })

  it('ignores pages that are not the room', () => {
    expect(boardLocation('https://withhandlebars.com/about?x=1', here())).toBeNull()
    expect(boardLocation('https://withhandlebars.com/privacy', here())).toBeNull()
    expect(boardLocation('https://withhandlebars.com/standard/', here())).toBeNull()
  })

  it('ignores other origins and anything that is not a URL', () => {
    expect(boardLocation('https://example.com/?root=G', here())).toBeNull()
    expect(boardLocation('http://withhandlebars.com/?root=G', here())).toBeNull()
    expect(boardLocation('not a url', here())).toBeNull()
  })
})

describe('listening for shared boards', () => {
  const replace = vi.fn()

  beforeEach(() => {
    urlOpen = undefined
    addListener.mockClear()
    replace.mockClear()
    vi.stubGlobal('location', { search: '', replace })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'Capacitor')
  })

  it('never loads the plugin on the website', async () => {
    await listenForBoardLinks()
    expect(addListener).not.toHaveBeenCalled()
  })

  it('navigates to the board a link names inside the app', async () => {
    Object.assign(window, {
      Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
    })
    await listenForBoardLinks()
    expect(addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function))
    urlOpen?.({ url: 'https://withhandlebars.com/?root=D&mode=scale' })
    expect(replace).toHaveBeenCalledWith('/?root=D&mode=scale')
  })

  it('leaves the app alone for a link that is not a board', async () => {
    Object.assign(window, {
      Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
    })
    await listenForBoardLinks()
    urlOpen?.({ url: 'https://withhandlebars.com/' })
    expect(replace).not.toHaveBeenCalled()
  })
})
