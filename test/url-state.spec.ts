import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATE,
  buildLensQuery,
  buildQuery,
  parseLocation,
  parseQuery,
  stateLocation,
  type RoomState,
} from '../src/lib/url-state.js'
import { BOARDS, boardFromPath, boardPath } from '../src/lib/board-path.js'

const state = (over: Partial<RoomState> = {}): RoomState => ({ ...DEFAULT_STATE, ...over })

describe('buildQuery', () => {
  it('serializes the default state to an empty query', () => {
    expect(buildQuery(state())).toBe('')
  })

  it('serializes only non-default values', () => {
    expect(buildQuery(state({ root: 'Db', chordId: 'maj7', tuningId: 'drop-d' }))).toBe(
      'root=Db&chord=maj7&tuning=drop-d',
    )
  })

  it('always names the scale in scale mode', () => {
    expect(buildQuery(state({ mode: 'scale', scaleId: 'dorian' }))).toBe('scale=dorian')
  })

  it('serializes offsets, display options, and encodes sharps safely', () => {
    const q = buildQuery(
      state({
        root: 'C#',
        offsets: [-2, 0, 0, 0, 0, 0],
        labelMode: 'intervals',
        spelling: 'simple',
        handedness: 'left',
        stringOrder: 'bass-top',
      }),
    )
    expect(q).toBe(
      'root=C%23&offsets=-2%2C0%2C0%2C0%2C0%2C0&labels=intervals&spelling=simple&hand=left&bass=top',
    )
  })
})

describe('parseQuery', () => {
  it('round-trips every field', () => {
    const full = state({
      mode: 'scale',
      root: 'Gb',
      scaleId: 'mela-kanakangi-1',
      tuningId: 'nst',
      offsets: [1, 0, 0, 0, 0, -1],
      labelMode: 'intervals',
      spelling: 'simple',
      handedness: 'left',
      stringOrder: 'bass-top',
    })
    const round = { ...state(), ...parseQuery(buildQuery(full)) }
    expect(round).toEqual({ ...full, chordId: DEFAULT_STATE.chordId })
  })

  it('ignores unknown ids and garbage', () => {
    expect(parseQuery('root=H&chord=nonsense&tuning=banjo&hand=up')).toEqual({})
    expect(parseQuery('offsets=1,2,zzz')).toEqual({})
    expect(parseQuery('offsets=99,0,0,0,0,0')).toEqual({})
    // Number('') === 0 must not make empty segments look valid
    expect(parseQuery('offsets=1,,2')).toEqual({})
    expect(parseQuery('offsets=1, 2,3')).toEqual({})
  })

  it('treats all-zero offsets as default', () => {
    expect(parseQuery('offsets=0,0,0,0,0,0')).toEqual({ offsets: [] })
  })

  it('round-trips instrument and speed, rejecting invalid values', () => {
    expect(buildQuery(state({ instrument: 'electric-jazz', speed: 0 }))).toBe(
      'instrument=electric-jazz&speed=0',
    )
    expect(parseQuery('instrument=electric-jazz&speed=0')).toEqual({
      instrument: 'electric-jazz',
      speed: 0,
    })
    expect(parseQuery('instrument=kazoo&speed=9')).toEqual({})
  })

  it('round-trips the fret count, rejecting values off the menu', () => {
    expect(buildQuery(state({ fretCount: 24 }))).toBe('frets=24')
    expect(parseQuery('frets=24')).toEqual({ fretCount: 24 })
    expect(parseQuery('frets=20')).toEqual({ fretCount: 20 })
    expect(parseQuery('frets=13')).toEqual({})
    expect(parseQuery('frets=banana')).toEqual({})
  })

  it('round-trips staff visibility, rejecting other values', () => {
    expect(buildQuery(state({ staff: 'hide' }))).toBe('staff=hide')
    expect(parseQuery('staff=hide')).toEqual({ staff: 'hide' })
    expect(parseQuery('staff=sideways')).toEqual({})
  })

  it('round-trips the position box, rejecting out-of-shape values', () => {
    expect(buildQuery(state({ box: 3 }))).toBe('box=3')
    expect(buildQuery(state({ box: 0 }))).toBe('')
    expect(parseQuery('box=3')).toEqual({ box: 3 })
    expect(parseQuery('box=24')).toEqual({ box: 24 })
    expect(parseQuery('box=0')).toEqual({})
    expect(parseQuery('box=25')).toEqual({})
    expect(parseQuery('box=x')).toEqual({})
  })

  it('round-trips the shape lens, rejecting other values', () => {
    expect(buildQuery(state({ box: 2, shape: 'pattern' }))).toBe('box=2&shape=pattern')
    expect(buildQuery(state({ shape: 'box' }))).toBe('')
    // the lens is meaningless without an active position — keep links honest
    expect(buildQuery(state({ box: 0, shape: 'pattern' }))).toBe('')
    expect(parseQuery('shape=pattern')).toEqual({ shape: 'pattern' })
    expect(parseQuery('shape=zigzag')).toEqual({})
  })

  it('accepts the whole walked-shape family', () => {
    expect(buildQuery(state({ box: 2, shape: 'diagonal' }))).toBe('box=2&shape=diagonal')
    expect(parseQuery('shape=diagonal')).toEqual({ shape: 'diagonal' })
    expect(parseQuery('shape=run')).toEqual({ shape: 'run' })
    expect(parseQuery('shape=sweep')).toEqual({ shape: 'sweep' })
  })

  it('round-trips the string lens, rejecting out-of-shape values', () => {
    expect(buildQuery(state({ soloStrings: [6] }))).toBe('string=6')
    expect(buildQuery(state({ soloStrings: [] }))).toBe('')
    expect(parseQuery('string=6')).toEqual({ soloStrings: [6] })
    expect(parseQuery('string=0')).toEqual({})
    expect(parseQuery('string=9')).toEqual({})
    expect(parseQuery('string=x')).toEqual({})
  })

  it('carries several strings as a normalized comma list', () => {
    expect(buildQuery(state({ soloStrings: [2, 3] }))).toBe('string=2%2C3')
    expect(parseQuery('string=2,3')).toEqual({ soloStrings: [2, 3] })
    // out of order and duplicated input normalizes
    expect(parseQuery('string=3,2,3')).toEqual({ soloStrings: [2, 3] })
    expect(parseQuery('string=2,')).toEqual({})
    expect(parseQuery('string=2,9')).toEqual({})
  })

  it('round-trips the roles and guides toggles, rejecting other values', () => {
    expect(buildQuery(state({ roles: 'on' }))).toBe('roles=on')
    expect(buildQuery(state({ guides: 'on' }))).toBe('guides=on')
    expect(buildQuery(state({ roles: 'off', guides: 'off' }))).toBe('')
    expect(parseQuery('roles=on')).toEqual({ roles: 'on' })
    expect(parseQuery('guides=on')).toEqual({ guides: 'on' })
    expect(parseQuery('roles=off')).toEqual({})
    expect(parseQuery('roles=purple&guides=maybe')).toEqual({})
  })

  it('round-trips the circle panel visibility, rejecting other values', () => {
    expect(buildQuery(state({ circle: 'hide' }))).toBe('circle=hide')
    expect(buildQuery(state({ circle: 'show' }))).toBe('')
    expect(parseQuery('circle=hide')).toEqual({ circle: 'hide' })
    expect(parseQuery('circle=sideways')).toEqual({})
  })

  it('round-trips the octave map, rejecting other values', () => {
    expect(buildQuery(state({ octaves: 'on' }))).toBe('octaves=on')
    expect(buildQuery(state({ octaves: 'off' }))).toBe('')
    expect(parseQuery('octaves=on')).toEqual({ octaves: 'on' })
    expect(parseQuery('octaves=off')).toEqual({})
    expect(parseQuery('octaves=maybe')).toEqual({})
  })

  it('round-trips the overlay in scale mode only, validating its shape', () => {
    expect(buildQuery(state({ mode: 'scale', overlay: '2-m7' }))).toBe(
      'scale=major&overlay=2-m7',
    )
    // an overlay means nothing while a chord is selected
    expect(buildQuery(state({ mode: 'chord', overlay: '2-m7' }))).toBe('')
    expect(parseQuery('overlay=2-m7')).toEqual({ overlay: '2-m7' })
    expect(parseQuery('overlay=2-nope')).toEqual({})
    expect(parseQuery('overlay=m7')).toEqual({})
    expect(parseQuery('overlay=99-m7')).toEqual({})
    expect(parseQuery('overlay=0-m7')).toEqual({})
  })

  it('prefers chord over scale if both are present', () => {
    expect(parseQuery('chord=m7&scale=dorian')).toEqual({ mode: 'chord', chordId: 'm7' })
  })

  it('round-trips the details, anatomy, and practice cards', () => {
    expect(buildQuery(state({ info: 'hide', anatomy: 'hide' }))).toBe('info=hide&anatomy=hide')
    expect(buildQuery(state({ info: 'show', anatomy: 'show' }))).toBe('')
    expect(parseQuery('info=hide')).toEqual({ info: 'hide' })
    expect(parseQuery('anatomy=hide')).toEqual({ anatomy: 'hide' })
    expect(parseQuery('info=maybe')).toEqual({})
    expect(buildQuery(state({ pcard: 'hide' }))).toBe('pcard=hide')
    expect(buildQuery(state({ pcard: 'show' }))).toBe('')
    expect(parseQuery('pcard=hide')).toEqual({ pcard: 'hide' })
    expect(parseQuery('pcard=maybe')).toEqual({})
  })

  it('round-trips the practice tab, rejecting junk', () => {
    expect(buildQuery(state({ practice: 'quiz' }))).toBe('practice=quiz')
    expect(buildQuery(state({ practice: 'off' }))).toBe('')
    expect(parseQuery('practice=patterns')).toEqual({ practice: 'patterns' })
    expect(parseQuery('practice=off')).toEqual({})
    expect(parseQuery('practice=shred')).toEqual({})
  })

  it('carries the pattern only on the patterns tab', () => {
    expect(buildQuery(state({ practice: 'patterns', pattern: 'thirds' }))).toBe(
      'practice=patterns&pattern=thirds',
    )
    expect(buildQuery(state({ practice: 'patterns', pattern: 'asc' }))).toBe(
      'practice=patterns',
    )
    expect(buildQuery(state({ practice: 'quiz', pattern: 'thirds' }))).toBe('practice=quiz')
    expect(parseQuery('pattern=groups3')).toEqual({ pattern: 'groups3' })
    expect(parseQuery('pattern=zigzag')).toEqual({})
    expect(buildQuery(state({ practice: 'patterns', arp: 'on' }))).toBe(
      'practice=patterns&arp=on',
    )
    expect(buildQuery(state({ practice: 'quiz', arp: 'on' }))).toBe('practice=quiz')
    expect(parseQuery('arp=on')).toEqual({ arp: 'on' })
    expect(parseQuery('arp=off')).toEqual({})
  })

  it('carries the progression settings only on the progression tab', () => {
    expect(
      buildQuery(state({ practice: 'progression', prog: 'blues-12', sevenths: 'on' })),
    ).toBe('practice=progression&prog=blues-12&sevenths=on')
    expect(buildQuery(state({ practice: 'progression' }))).toBe('practice=progression')
    expect(buildQuery(state({ practice: 'quiz', prog: 'blues-12', sevenths: 'on' }))).toBe(
      'practice=quiz',
    )
    expect(parseQuery('prog=ii-v-i')).toEqual({ prog: 'ii-v-i' })
    expect(parseQuery('prog=nope')).toEqual({})
    expect(parseQuery('sevenths=on')).toEqual({ sevenths: 'on' })
    expect(parseQuery('sevenths=off')).toEqual({})
  })

  it('carries the voicing choice on the progression tab only', () => {
    expect(buildQuery(state({ practice: 'progression', voicing: 'root' }))).toBe(
      'practice=progression&voicing=root',
    )
    expect(buildQuery(state({ practice: 'progression' }))).toBe('practice=progression')
    expect(buildQuery(state({ practice: 'quiz', voicing: 'root' }))).toBe('practice=quiz')
    expect(parseQuery('voicing=root')).toEqual({ voicing: 'root' })
    expect(parseQuery('voicing=smooth')).toEqual({})
    expect(parseQuery('voicing=nope')).toEqual({})
  })

  it('carries the bar feel and key cycling on the progression tab only', () => {
    expect(buildQuery(state({ practice: 'progression', feel: 'strum', cycle: 'on' }))).toBe(
      'practice=progression&feel=strum&cycle=on',
    )
    expect(buildQuery(state({ practice: 'quiz', feel: 'arpeggio', cycle: 'on' }))).toBe(
      'practice=quiz',
    )
    expect(parseQuery('feel=arpeggio')).toEqual({ feel: 'arpeggio' })
    expect(parseQuery('feel=shred')).toEqual({})
    expect(parseQuery('cycle=on')).toEqual({ cycle: 'on' })
    expect(parseQuery('cycle=off')).toEqual({})
  })

  it('carries the click and drone settings only while the panel is open', () => {
    expect(buildQuery(state({ practice: 'quiz', meter: '6/8', sub: 3 }))).toBe(
      'practice=quiz&meter=6%2F8&sub=3',
    )
    expect(
      buildQuery(
        state({ practice: 'patterns', droneVoice: 'fifth', droneMode: 'pulse', droneLevel: 35 }),
      ),
    ).toBe('practice=patterns&dvoice=fifth&dmode=pulse&dvol=35')
    // closed panel: none of it means anything
    expect(buildQuery(state({ meter: '6/8', sub: 4, droneMode: 'pulse', droneLevel: 5 }))).toBe('')
    expect(parseQuery('meter=3/4')).toEqual({ meter: '3/4' })
    expect(parseQuery('meter=5/4')).toEqual({})
    expect(parseQuery('sub=4')).toEqual({ sub: 4 })
    expect(parseQuery('sub=5')).toEqual({})
    expect(parseQuery('dvoice=fifth')).toEqual({ droneVoice: 'fifth' })
    expect(parseQuery('dvoice=power')).toEqual({})
    expect(parseQuery('dmode=pulse')).toEqual({ droneMode: 'pulse' })
    expect(parseQuery('dmode=loud')).toEqual({})
    expect(parseQuery('dvol=0')).toEqual({ droneLevel: 0 })
    expect(parseQuery('dvol=101')).toEqual({})
    expect(parseQuery('dvol=-3')).toEqual({})
  })

  it('round-trips the tempo within range', () => {
    expect(buildQuery(state({ tempo: 92 }))).toBe('tempo=92')
    expect(buildQuery(state({ tempo: 100 }))).toBe('')
    expect(parseQuery('tempo=180')).toEqual({ tempo: 180 })
    expect(parseQuery('tempo=39')).toEqual({})
    expect(parseQuery('tempo=241')).toEqual({})
    expect(parseQuery('tempo=fast')).toEqual({})
  })
})

// HB-153: a tier-1 board has a page of its own, and its path names the board.
describe('board paths', () => {
  it('round-trips every tier-1 board through its path', () => {
    expect(BOARDS).toHaveLength(432)
    for (const board of BOARDS) expect(boardFromPath(boardPath(board)!)).toEqual(board)
  })

  it('reads a path with or without its trailing slash, and as the file the build writes', () => {
    const am7 = { tuningId: 'standard', root: 'A', mode: 'chord', typeId: 'm7' }
    expect(boardFromPath('/standard/a/chord/minor-7/')).toEqual(am7)
    expect(boardFromPath('/standard/a/chord/minor-7')).toEqual(am7)
    expect(boardFromPath('/standard/a/chord/minor-7/index.html')).toEqual(am7)
    expect(boardFromPath('/standard/c-sharp/scale/melodic-minor/')).toEqual({
      tuningId: 'standard',
      root: 'C#',
      mode: 'scale',
      typeId: 'melodic-minor-ascending',
    })
  })

  it('names nothing for paths outside the inventory', () => {
    for (const path of [
      '/',
      '/about',
      '/standard/',
      '/standard/a/chord/m7/', // a core id, never a slug
      '/standard/d-flat/chord/minor-7/', // the twin of a published root
      '/drop-d/a/chord/minor-7/', // not a tier-1 tuning yet
      '/standard/a/scale/minor-7/', // a chord slug under scale
      '/Standard/A/chord/minor-7/',
      '/standard/a/chord/minor-7/extra/',
    ])
      expect(boardFromPath(path), path).toBeNull()
  })

  it('has no path for a board outside the inventory', () => {
    expect(boardPath({ tuningId: 'standard', root: 'Db', mode: 'chord', typeId: 'm7' })).toBeNull()
    expect(boardPath({ tuningId: 'drop-d', root: 'A', mode: 'chord', typeId: 'm7' })).toBeNull()
    expect(boardPath({ tuningId: 'standard', root: 'A', mode: 'chord', typeId: 'm11' })).toBeNull()
  })
})

describe('parseLocation', () => {
  it('takes the board from the path and the rest from the query', () => {
    expect(parseLocation('/standard/e/scale/dorian/', '?root=C&chord=m7&frets=24')).toMatchObject({
      mode: 'scale',
      root: 'E',
      scaleId: 'dorian',
      tuningId: 'standard',
      fretCount: 24,
    })
  })

  it('falls back to the query anywhere else', () => {
    expect(parseLocation('/', '?root=A&chord=m7')).toEqual(parseQuery('?root=A&chord=m7'))
    expect(parseLocation('/drop-d/a/chord/minor-7/', '?root=G')).toEqual({ root: 'G' })
  })
})

describe('stateLocation', () => {
  it('is the board path with the lenses as a query for a tier-1 board', () => {
    expect(stateLocation(state({ root: 'A', chordId: 'm7' }))).toBe('/standard/a/chord/minor-7/')
    expect(stateLocation(state({ root: 'A', chordId: 'm7', octaves: 'on', fretCount: 24 }))).toBe(
      '/standard/a/chord/minor-7/?frets=24&octaves=on',
    )
  })

  it('is the room with the whole state in the query otherwise', () => {
    expect(stateLocation(state({ root: 'A', chordId: 'm7', tuningId: 'drop-d' }))).toBe(
      '/?root=A&chord=m7&tuning=drop-d',
    )
    expect(stateLocation(state({ root: 'Db' }), '/index.html')).toBe('/index.html?root=Db')
  })

  it('leaves the board fields out of the lens query', () => {
    expect(buildLensQuery(state({ mode: 'scale', root: 'A', scaleId: 'dorian', staff: 'hide' }))).toBe(
      'staff=hide',
    )
  })
})
