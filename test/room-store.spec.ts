import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { getFretboardDots } from '@anunnakicosmocrew/handlebars'
import { STORAGE_KEY, useRoomStore } from '../src/stores/room.js'

function freshStore() {
  setActivePinia(createPinia())
  return useRoomStore()
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

describe('room store', () => {
  it('starts from defaults', () => {
    const store = freshStore()
    expect(store.snapshot).toMatchObject({ mode: 'chord', root: 'E', chordId: 'major' })
    expect(store.tuning.id).toBe('standard')
  })

  it('restores from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ root: 'A', chord: 'm7' }))
    const store = freshStore()
    expect(store.root).toBe('A')
    expect(store.chordId).toBe('m7')
  })

  it('lets the URL win over localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ root: 'A' }))
    history.replaceState(null, '', '/?root=Db&scale=dorian')
    const store = freshStore()
    expect(store.root).toBe('Db')
    expect(store.mode).toBe('scale')
    expect(store.scaleId).toBe('dorian')
  })

  it('opens a board link as sent, without the visitor\'s stored settings', () => {
    // The link omits defaults, so a missing field means the default — not the
    // recipient's drop-D from last week.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tuning: 'drop-d', labels: 'intervals' }))
    history.replaceState(null, '', '/?root=G')
    const store = freshStore()
    expect(store.root).toBe('G')
    expect(store.tuning.id).toBe('standard')
    expect(store.labelMode).toBe('names')
  })

  it('opens a shared default board on defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ root: 'A', tuning: 'drop-d' }))
    history.replaceState(null, '', '/?root=E')
    const store = freshStore()
    expect(store.root).toBe('E')
    expect(store.tuning.id).toBe('standard')
  })

  it('falls back to the stored board when the URL names nothing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ root: 'A' }))
    history.replaceState(null, '', '/?utm_source=newsletter')
    const store = freshStore()
    expect(store.root).toBe('A')
  })

  it('persists changes to localStorage and reflects them in the URL', async () => {
    const store = freshStore()
    store.root = 'F#'
    store.chordId = 'maj9'
    await nextTick()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      root: 'F#',
      chord: 'maj9',
    })
    // A tier-1 board is reflected as its own page's path (HB-153).
    expect(location.pathname + location.search).toBe('/standard/f-sharp/chord/major-9/')
  })

  it('keeps the query form for a board without a page of its own', async () => {
    const store = freshStore()
    store.root = 'Db' // C# is the published spelling; its twin stays query-only
    await nextTick()
    expect(location.pathname + location.search).toBe('/?root=Db')
    store.root = 'E'
    await nextTick()
    expect(location.pathname + location.search).toBe('/standard/e/chord/major/')
  })

  it('opens the board a board path names, with the query adding the rest', () => {
    // The path wins over a stale query and over the visitor's stored board.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tuning: 'drop-d' }))
    history.replaceState(null, '', '/standard/a/scale/dorian/?root=C&frets=24')
    const store = freshStore()
    expect([store.mode, store.root, store.scaleId, store.tuningId]).toEqual([
      'scale',
      'A',
      'dorian',
      'standard',
    ])
    expect(store.fretCount).toBe(24)
  })

  it('moves between board paths, and back to the room for a board without one', async () => {
    history.replaceState(null, '', '/standard/a/chord/minor-7/?octaves=on')
    const store = freshStore()
    store.chordId = 'm9'
    await nextTick()
    expect(location.pathname + location.search).toBe('/standard/a/chord/minor-9/?octaves=on')
    store.chordId = 'm11'
    await nextTick()
    expect(location.pathname + location.search).toBe('/?root=A&chord=m11&octaves=on')
  })

  it('applies tuner offsets and flags the tuning custom', async () => {
    const store = freshStore()
    store.tune(0, -1)
    store.tune(0, -1)
    await nextTick()
    expect(store.tuning.id).toBe('custom')
    expect(store.tuning.strings[0]).toBe(38)
    expect(store.isCustomTuning).toBe(true)
    expect(location.search).toContain('offsets=-2%2C0%2C0%2C0%2C0%2C0')
  })

  it('extends the dots past fret 12 when the fret count grows', async () => {
    const store = freshStore()
    expect(store.fretCount).toBe(12)
    expect(Math.max(...store.dots.map(d => d.fret))).toBeLessThanOrEqual(12)
    store.fretCount = 24
    await nextTick()
    expect(Math.max(...store.dots.map(d => d.fret))).toBeGreaterThan(12)
    expect(location.search).toBe('?frets=24')
  })

  it('pins a pitch, toggles it off, and keeps ghost and pin exclusive', () => {
    const store = freshStore()
    expect(store.staffPitches.map(p => p.midi)).toContain(52)
    store.focusPitch(52)
    expect(store.focusedPitch).toBe(52)
    store.identifyCell(2, 3)
    expect(store.focusedPitch).toBe(null)
    expect(store.ghost).toMatchObject({ string: 2, fret: 3, name: 'F', inSelection: false })
    store.focusPitch(52)
    expect(store.ghost).toBe(null)
    store.focusPitch(52)
    expect(store.focusedPitch).toBe(null)
  })

  it('toggles the ghost off on a second click of the same cell', () => {
    const store = freshStore()
    store.identifyCell(2, 3)
    store.identifyCell(2, 3)
    expect(store.ghost).toBe(null)
  })

  it('clears pinned state when the selection changes', async () => {
    const store = freshStore()
    store.focusPitch(52)
    store.root = 'A'
    await nextTick()
    expect(store.focusedPitch).toBe(null)
  })

  it('keeps pitch state out of the URL and localStorage', async () => {
    const store = freshStore()
    store.focusPitch(52)
    await nextTick()
    expect(location.search).toBe('')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null)
  })

  it('derives boxes from the selection: 3 for a triad, 7 for a diatonic scale', () => {
    const store = freshStore()
    expect(store.boxes).toHaveLength(3)
    expect(store.activeBox).toBe(null)
    store.mode = 'scale'
    expect(store.boxes).toHaveLength(7)
    store.setBox(3)
    expect(store.activeBox?.minFret).toBe(4)
  })

  it('offers more positions on a longer neck, clamping when it shrinks back', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.fretCount = 24
    await nextTick()
    expect(store.boxes).toHaveLength(14)
    store.setBox(14)
    await nextTick()
    expect(store.activeBox?.minFret).toBe(23)
    store.fretCount = 12
    await nextTick()
    expect(store.box).toBe(0)
  })

  it('cleans up cold-loaded box/overlay that pass shape checks but never resolve', () => {
    // major scale: 7 boxes, no degree 12 — both params are dead on arrival
    history.replaceState(null, '', '/?scale=major&box=9&overlay=12-major')
    const store = freshStore()
    expect(store.box).toBe(0)
    expect(store.overlay).toBe('')
  })

  it('clamps the box when the selection shrinks under it', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.setBox(7)
    await nextTick()
    expect(store.activeBox).not.toBe(null)
    store.mode = 'chord' // triad: only 3 boxes
    await nextTick()
    expect(store.box).toBe(0)
  })

  it('derives pattern keys only in pattern lens with an active position', async () => {
    const store = freshStore()
    store.mode = 'scale'
    expect(store.patternKeys).toBe(null)
    store.setBox(1)
    store.setShape('pattern')
    await nextTick()
    // E major from the open anchor: three notes per string, 18 keys
    expect(store.patternKeys?.size).toBe(18)
    expect(store.patternKeys?.has('0:0')).toBe(true)
    // the rectangle outline is withheld in pattern lens
    expect(store.outlinedBox).toBe(null)
    store.setShape('box')
    await nextTick()
    expect(store.patternKeys).toBe(null)
    expect(store.outlinedBox).not.toBe(null)
  })

  it('filters the staff to the pattern in pattern lens', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.setBox(1)
    store.setShape('pattern')
    await nextTick()
    // the walk spans E2 (open low E) up to A4 (fret 5, high E) — 18 pitches
    expect(store.staffPitches).toHaveLength(18)
    expect(store.staffPitches[0]!.midi).toBe(40)
    expect(store.staffPitches.at(-1)!.midi).toBe(69)
  })

  it('derives lens keys for the diagonal, run, and sweep shapes', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.setBox(1)
    store.setShape('diagonal')
    await nextTick()
    // E major from the open anchor: 3+4 tones per string pair, 21 keys
    expect(store.patternKeys?.size).toBe(21)
    expect(store.outlinedBox).toBe(null)
    store.setShape('run')
    await nextTick()
    // the run adds the shifts up the top string to fret 12
    expect(store.patternKeys?.size).toBe(22)
    expect(store.patternKeys?.has('5:12')).toBe(true)
    store.mode = 'chord'
    store.setShape('sweep')
    await nextTick()
    // the open-E sweep shape, one tone per string
    expect([...store.patternKeys!]).toEqual(['0:0', '1:2', '2:2', '3:1', '4:0', '5:0'])
  })

  it('resets a sweep lens when the mode flips to scale', async () => {
    const store = freshStore()
    store.setBox(1)
    store.setShape('sweep')
    await nextTick()
    expect(store.patternKeys?.size).toBe(6)
    store.mode = 'scale'
    await nextTick()
    expect(store.shape).toBe('box')
  })

  it('solos strings: toggling in and out, dimming, staff filter, URL', async () => {
    const store = freshStore()
    store.toggleSoloString(6)
    await nextTick()
    expect([...store.stringKeys!].every(k => k.startsWith('5:'))).toBe(true)
    expect(store.lensKeys).toBe(store.stringKeys)
    expect(location.search).toBe('?string=6')
    store.toggleSoloString(5)
    await nextTick()
    expect(store.soloStrings).toEqual([5, 6])
    const strings = new Set([...store.stringKeys!].map(k => Number(k.split(':')[0])))
    expect(strings).toEqual(new Set([4, 5]))
    expect(
      store.staffPitches.every(p =>
        p.positions.some(pos => pos.string === 4 || pos.string === 5),
      ),
    ).toBe(true)
    expect(location.search).toBe('?string=5%2C6')
    store.toggleSoloString(6)
    await nextTick()
    expect(store.soloStrings).toEqual([5])
    store.clearSoloStrings()
    await nextTick()
    expect(store.stringKeys).toBe(null)
    expect(location.search).toBe('')
  })

  it('keeps the position, string, and octave lenses mutually exclusive', () => {
    const store = freshStore()
    store.setBox(2)
    store.toggleSoloString(3)
    expect(store.box).toBe(0)
    store.setOctaves('on')
    expect(store.soloStrings).toEqual([])
    store.setBox(1)
    expect(store.octaves).toBe('off')
  })

  it('maps root octaves with core links when the octave lens is on', async () => {
    const store = freshStore()
    store.setOctaves('on')
    await nextTick()
    expect(store.octaveLinks!.length).toBeGreaterThan(0)
    for (const l of store.octaveLinks!) expect(l.to.midi).toBe(l.from.midi + 12)
    expect(store.octaveKeys!.has('0:0')).toBe(true) // the open low E root
    expect(store.lensKeys).toBe(store.octaveKeys)
    expect(location.search).toBe('?octaves=on')
  })

  it('resolves a cold-loaded lens pile-up: position wins', () => {
    history.replaceState(null, '', '/?box=2&string=3&octaves=on')
    const store = freshStore()
    expect(store.box).toBe(2)
    expect(store.soloStrings).toEqual([])
    expect(store.octaves).toBe('off')
  })

  it('clamps cold-loaded solo strings beyond the tuning, keeping the rest', () => {
    history.replaceState(null, '', '/?string=5,8')
    const store = freshStore()
    expect(store.soloStrings).toEqual([5])
  })

  it('filters the staff inventory to the active box', async () => {
    const store = freshStore()
    const all = store.staffPitches.length
    store.setBox(2) // anchor fret 4, window [4, 8]
    await nextTick()
    expect(store.staffPitches.length).toBeLessThan(all)
    // the open low E (midi 40) lives only at fret 0 — outside the box
    expect(store.staffPitches.map(p => p.midi)).not.toContain(40)
  })

  it('persists box and overlay in the URL, overlay only in scale mode', async () => {
    const store = freshStore()
    store.setBox(2)
    await nextTick()
    expect(location.search).toBe('?box=2')
    store.mode = 'scale'
    store.setOverlay('2-m7')
    await nextTick()
    expect(location.search).toContain('overlay=2-m7')
    store.mode = 'chord'
    await nextTick()
    expect(location.search).not.toContain('overlay')
  })

  it('resolves the overlay against the scale, spelled by the scale', () => {
    const store = freshStore()
    store.mode = 'scale'
    store.root = 'F#'
    store.setOverlay('7-m7b5')
    expect(store.overlayChord).toMatchObject({ root: 'E#', typeId: 'm7b5' })
    expect(store.overlayKeys?.size).toBeGreaterThan(0)
  })

  it('clears an overlay the new scale cannot host', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.setOverlay('7-m7b5')
    await nextTick()
    expect(store.overlayChord).not.toBe(null)
    store.scaleId = 'pentatonic-major' // five degrees — no degree 7
    await nextTick()
    expect(store.overlay).toBe('')
    expect(store.overlayChord).toBe(null)
  })

  it('marks exactly the overlay chord dots as overlay keys', () => {
    const store = freshStore()
    store.mode = 'scale'
    store.root = 'E'
    store.setOverlay('2-m7')
    const expected = getFretboardDots(
      store.tuning,
      { mode: 'chord', root: store.overlayChord!.root, typeId: 'm7' },
      store.spelling,
      store.fretCount,
    ).map(d => `${d.string}:${d.fret}`)
    expect([...store.overlayKeys!].sort()).toEqual([...new Set(expected)].sort())
  })

  it('clears a pinned pitch when the box changes', async () => {
    const store = freshStore()
    store.focusPitch(52)
    store.setBox(1)
    await nextTick()
    expect(store.focusedPitch).toBe(null)
  })

  it('resets offsets when the preset changes', () => {
    const store = freshStore()
    store.tune(0, 1)
    store.setTuning('drop-d')
    expect(store.fullOffsets).toEqual([0, 0, 0, 0, 0, 0])
    expect(store.tuning.letters).toEqual(['D', 'A', 'D', 'G', 'B', 'E'])
    expect(store.isCustomTuning).toBe(true) // non-standard preset
  })

  it('exposes dots and info for the current selection', () => {
    const store = freshStore()
    expect(new Set(store.dots.map(d => d.note))).toEqual(new Set(['E', 'G#', 'B']))
    expect(store.info.intervals).toEqual(['1', '3', '5'])
  })

  it('survives corrupted storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const store = freshStore()
    expect(store.root).toBe('E')
  })

  it('lights only the guide tones when the guide lens is on', async () => {
    const store = freshStore()
    store.chordId = '7' // E7: the 3rd is G#, the 7th is D
    store.setGuides('on')
    await nextTick()
    const dots = getFretboardDots(store.tuning, { mode: 'chord', root: 'E', typeId: '7' })
    const expected = new Set(
      dots
        .filter(d => d.role === 'third' || d.role === 'seventh')
        .map(d => `${d.string}:${d.fret}`),
    )
    expect(store.guideKeys).toEqual(expected)
    expect(store.lensKeys).toBe(store.guideKeys)
    expect(location.pathname + location.search).toBe('/standard/e/chord/dominant-7/?guides=on')
  })

  it('keeps the guide lens mutually exclusive with the other lenses', () => {
    const store = freshStore()
    store.setGuides('on')
    store.setBox(1)
    expect(store.guides).toBe('off')
    store.setGuides('on')
    expect(store.box).toBe(0)
    store.toggleSoloString(3)
    expect(store.guides).toBe('off')
    store.setGuides('on')
    expect(store.soloStrings).toEqual([])
    store.setOctaves('on')
    expect(store.guides).toBe('off')
    store.setGuides('on')
    expect(store.octaves).toBe('off')
  })

  it('resolves a cold-loaded lens pile-up with guides last', () => {
    history.replaceState(null, '', '/?octaves=on&guides=on')
    const store = freshStore()
    expect(store.octaves).toBe('on')
    expect(store.guides).toBe('off')
  })

  it('clamps the guide lens off when the selection has no guide tones', async () => {
    const store = freshStore()
    store.setGuides('on')
    await nextTick()
    expect(store.guides).toBe('on')
    store.chordId = '5' // power chord: no 3rd, no 7th — nothing to guide
    await nextTick()
    expect(store.guides).toBe('off')
    expect(store.hasGuideTones).toBe(false)
  })

  it('maps dot roles for the selection when roles are on', async () => {
    const store = freshStore()
    store.chordId = 'maj7'
    expect(store.dotRoles).toBe(null)
    store.roles = 'on'
    await nextTick()
    expect(store.dotRoles!.get('0:0')).toBe('root')
    expect(store.presentRoles).toEqual(['root', 'third', 'fifth', 'seventh'])
    expect(location.pathname + location.search).toBe('/standard/e/chord/major-7/?roles=on')
  })

  it('mirrors the roles onto the staff pitches by sounding midi', async () => {
    const store = freshStore()
    store.chordId = '7'
    expect(store.pitchRoles).toBe(null)
    store.roles = 'on'
    await nextTick()
    expect(store.pitchRoles!.get(40)).toBe('root') // open low E
    expect(store.pitchRoles!.get(44)).toBe('third') // G#2
    expect(store.pitchRoles!.get(50)).toBe('seventh') // D3
    expect(store.pitchRoles!.size).toBe(store.staffPitches.length)
  })

  it('reads guides and roles from the overlay chord when one is active', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.root = 'C'
    store.setOverlay('5-7') // G7 inside C major
    store.setGuides('on')
    store.roles = 'on'
    await nextTick()
    // both frames follow the overlay chord: keys and roles are subsets of it
    expect(store.guideKeys!.size).toBeGreaterThan(0)
    expect([...store.guideKeys!].every(k => store.overlayKeys!.has(k))).toBe(true)
    expect([...store.dotRoles!.keys()].every(k => store.overlayKeys!.has(k))).toBe(true)
    expect(store.dotRoles!.size).toBe(store.overlayKeys!.size)
  })

  it('annotates overlay chords with numerals and functions', () => {
    const store = freshStore()
    store.mode = 'scale'
    store.root = 'C'
    const triadIds = ['major', 'minor', 'dim', 'aug']
    const triads = store.overlayAnalysis.filter(c => triadIds.includes(c.typeId))
    expect(triads.map(c => c.numeral)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(triads.map(c => c.fn)).toEqual([
      'tonic',
      'subdominant',
      'tonic',
      'subdominant',
      'dominant',
      'tonic',
      'dominant',
    ])
    store.setOverlay('5-7')
    expect(store.overlayInfo).toMatchObject({ numeral: 'V7', fn: 'dominant' })
  })

  it('locates the selection on the circle of fifths', () => {
    const store = freshStore() // E major chord
    expect(store.circlePos).toEqual({ index: 4, ring: 'major' })
    expect(store.circleDiatonic).toBe(null) // chord mode has no key neighborhood
    store.chordId = 'm7'
    expect(store.circlePos).toEqual({ index: 1, ring: 'minor' }) // Em, under G
    store.mode = 'scale' // E major scale: A, E, B majors are diatonic
    const lit = store.circleDiatonic!.flatMap((f, i) => (f.major ? [i] : []))
    expect(lit).toEqual([3, 4, 5])
  })

  it('navigates keys from circle clicks', () => {
    const store = freshStore()
    store.selectCircleKey(1, 'major')
    expect(store.root).toBe('G')
    expect(store.chordId).toBe('major')
    store.selectCircleKey(7, 'major')
    expect(store.root).toBe('Db') // the flat-side spelling, never C#
    store.mode = 'scale'
    store.selectCircleKey(0, 'minor')
    expect(store.root).toBe('A')
    expect(store.scaleId).toBe('aeolian')
    store.selectCircleKey(11, 'major')
    expect(store.root).toBe('F')
    expect(store.scaleId).toBe('major')
  })

  it('exposes anatomy for the selection, switching to the overlay chord', async () => {
    const store = freshStore()
    expect(store.anatomy.thirds).toEqual(['major third', 'minor third'])
    store.mode = 'scale'
    await nextTick()
    expect(store.anatomy.thirds).toBe(null)
    store.setOverlay('5-7') // B7, the V7 of E major
    await nextTick()
    expect(store.anatomy.tones.map(t => t.token)).toEqual(['1', '3', '5', 'b7'])
    expect(store.anatomy.thirds).not.toBe(null)
  })

  it('sequences the practice run over the arpeggio, run, or box', async () => {
    const store = freshStore()
    // E major chord: root-position arpeggio from E3.
    expect(store.practicePool).toEqual([52, 56, 59])
    store.pattern = 'updown'
    await nextTick()
    expect(store.practiceRun).toEqual([52, 56, 59, 56, 52])
    store.mode = 'scale'
    store.pattern = 'asc'
    await nextTick()
    // E major scale runs one octave and tops on the octave root.
    expect(store.practicePool).toHaveLength(8)
    expect(store.practicePool[0]).toBe(52)
    expect(store.practicePool[7]).toBe(64)
    store.setBox(1)
    await nextTick()
    // Inside a position the pool is the box's exact pitch inventory.
    expect(store.practicePool).toEqual(store.staffPitches.map(p => p.midi))
  })

  it('swaps the practice pool to the overlay arpeggio when asked', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.arp = 'on'
    await nextTick()
    // no overlay chosen yet: still the scale run
    expect(store.practicePool).toHaveLength(8)
    store.setOverlay('5-7') // B7, the V7 of E major
    await nextTick()
    // B2-rooted dominant seventh: B D# F# A
    expect(store.practicePool).toEqual([59, 63, 66, 69])
    store.arp = 'off'
    await nextTick()
    expect(store.practicePool).toHaveLength(8)
  })

  it('harmonizes the progression preset for 7-note scales only', async () => {
    const store = freshStore()
    expect(store.progression).toBe(null) // chord mode
    store.mode = 'scale'
    store.root = 'C'
    await nextTick()
    expect(store.progression!.map(s => s.numeral)).toEqual(['I', 'IV', 'V'])
    expect(store.progression![0]!.midi).toEqual([48, 52, 55])
    store.prog = 'ii-v-i'
    store.sevenths = 'on'
    await nextTick()
    expect(store.progression!.map(s => s.chord?.label)).toEqual(['Dm7', 'G7', 'Cmaj7'])
    store.scaleId = 'pentatonic-major'
    await nextTick()
    expect(store.progression).toBe(null)
    expect(store.progressionPreset.id).toBe('ii-v-i')
  })

  it('voice-leads the progression by default, root position on demand', async () => {
    const store = freshStore()
    store.mode = 'scale'
    store.root = 'C'
    await nextTick()
    // Smooth: IV and V land on the inversion nearest the chord before them.
    expect(store.voicing).toBe('smooth')
    expect(store.progression!.map(s => s.midi)).toEqual([
      [48, 52, 55],
      [48, 53, 57],
      [47, 50, 55],
    ])
    store.voicing = 'root'
    await nextTick()
    expect(store.progression!.map(s => s.midi)).toEqual([
      [48, 52, 55],
      [53, 57, 60],
      [55, 59, 62],
    ])
  })
})
