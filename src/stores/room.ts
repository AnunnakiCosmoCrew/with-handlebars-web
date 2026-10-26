import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  CIRCLE_OF_FIFTHS,
  applyStringOffsets,
  boxPattern,
  circlePosition,
  describeSelection,
  diatonicOnCircle,
  diagonalPattern,
  diatonicChords,
  dotInBox,
  getFretboardDots,
  getSelectionInfo,
  getTuning,
  harmonicFunction,
  identifyPosition,
  PROGRESSION_PRESETS,
  progressionSteps,
  romanNumeral,
  rootOctaveLinks,
  runPattern,
  selectionBoxes,
  selectionMidiNotes,
  selectionPitches,
  sequenceNotes,
  sweepPath,
  type ScaleSelection,
  type Selection,
  type ToneRole,
} from '@anunnakicosmocrew/handlebars'
import {
  DEFAULT_STATE,
  buildQuery,
  parseLocation,
  parseQuery,
  stateLocation,
  type RoomState,
} from '../lib/url-state.js'
import { boardFromPath } from '../lib/board-path.js'

export const STORAGE_KEY = 'handlebars.guitar-advanced.v1'

function loadStored(): Partial<RoomState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    // Run stored JSON through the same validator as the URL so stale or
    // hand-edited values can never poison the store.
    return parseQuery(new URLSearchParams(JSON.parse(raw)).toString())
  } catch {
    return {}
  }
}

function persist(state: RoomState) {
  try {
    const q = new URLSearchParams(buildQuery(state))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(q)))
  } catch {
    /* storage unavailable — state simply won't survive the session */
  }
}

function reflectUrl(state: RoomState) {
  if (typeof history === 'undefined') return
  // A board page names one board, so a state it no longer shows goes back to the
  // room's own path rather than carrying a query on top of the wrong board.
  const roomPath = boardFromPath(location.pathname) ? '/' : location.pathname
  history.replaceState(history.state, '', stateLocation(state, roomPath))
}

/**
 * Where the room starts. A URL that names a board *is* the board — by its
 * path on a board page (HB-153), by its query anywhere else: the query omits every default (`buildQuery`), so a field it leaves out means "the
 * default", not "whatever this visitor had last" — merging local state into it
 * would open a sender's standard-tuning link in the recipient's stored drop-D.
 * Only a URL that names nothing (the bare site, or junk parameters) falls back
 * to the visitor's own last board. Reloading the room's own URL loses nothing
 * either way, since the URL and localStorage are written from the same query.
 */
export function initialState(search: string, pathname = ''): RoomState {
  const fromUrl = parseLocation(pathname, search)
  const base = Object.keys(fromUrl).length ? {} : loadStored()
  return { ...DEFAULT_STATE, ...base, ...fromUrl }
}

/**
 * The one store for the Guitar (Advanced) room. Initial state resolves as
 * `initialState()` describes, so shared links always show what the sender saw;
 * every change is written back to both the URL and localStorage.
 */
export const useRoomStore = defineStore('guitar-advanced', () => {
  const initial: RoomState =
    typeof location === 'undefined' ? initialState('') : initialState(location.search, location.pathname)

  const mode = ref(initial.mode)
  const root = ref(initial.root)
  const chordId = ref(initial.chordId)
  const scaleId = ref(initial.scaleId)
  const tuningId = ref(initial.tuningId)
  const labelMode = ref(initial.labelMode)
  const spelling = ref(initial.spelling)
  const handedness = ref(initial.handedness)
  const stringOrder = ref(initial.stringOrder)
  const instrument = ref(initial.instrument)
  const speed = ref(initial.speed)
  const fretCount = ref(initial.fretCount)
  const staff = ref(initial.staff)
  const box = ref(initial.box)
  const shape = ref(initial.shape)
  const overlay = ref(initial.overlay)
  const soloStrings = ref(initial.soloStrings)
  const octaves = ref(initial.octaves)
  const roles = ref(initial.roles)
  const guides = ref(initial.guides)
  const circle = ref(initial.circle)
  // Card visibility for the details/anatomy panels ("info"/"anatomy" as
  // names belong to the derived data below).
  const infoCard = ref(initial.info)
  const anatomyCard = ref(initial.anatomy)
  const practiceCard = ref(initial.pcard)
  const practice = ref(initial.practice)
  const pattern = ref(initial.pattern)
  const arp = ref(initial.arp)
  const prog = ref(initial.prog)
  const sevenths = ref(initial.sevenths)
  const voicing = ref(initial.voicing)
  const feel = ref(initial.feel)
  const cycle = ref(initial.cycle)
  const tempo = ref(initial.tempo)
  const meter = ref(initial.meter)
  const sub = ref(initial.sub)
  const droneVoice = ref(initial.droneVoice)
  const droneMode = ref(initial.droneMode)
  const droneLevel = ref(initial.droneLevel)

  const baseTuning = computed(() => getTuning(tuningId.value))
  const offsets = ref(
    initial.offsets.length === baseTuning.value.strings.length ? initial.offsets : [],
  )

  const fullOffsets = computed(() =>
    offsets.value.length === baseTuning.value.strings.length
      ? offsets.value
      : Array<number>(baseTuning.value.strings.length).fill(0),
  )
  const tuning = computed(() => applyStringOffsets(baseTuning.value, fullOffsets.value))
  const isCustomTuning = computed(
    () => tuningId.value !== 'standard' || fullOffsets.value.some(o => o !== 0),
  )

  const selection = computed<Selection>(() => ({
    mode: mode.value,
    root: root.value,
    typeId: mode.value === 'chord' ? chordId.value : scaleId.value,
  }))
  const dots = computed(() =>
    getFretboardDots(tuning.value, selection.value, spelling.value, fretCount.value),
  )
  const info = computed(() => getSelectionInfo(selection.value, spelling.value))

  // Positions: algorithmic boxes over the selection, plus the scale-mode
  // chord overlay ("first scale, then chords").
  const boxes = computed(() => selectionBoxes(tuning.value, selection.value, fretCount.value))
  const activeBox = computed(() => boxes.value.find(b => b.index === box.value) ?? null)

  // Walked shape lenses: the active box rendered as one of the core's
  // fingering walks, as "string:fret" keys; null while showing the rectangle
  // (or no position at all).
  const SHAPE_WALKS = {
    pattern: boxPattern,
    diagonal: diagonalPattern,
    run: runPattern,
    sweep: sweepPath,
  } as const
  const patternKeys = computed(() => {
    const b = activeBox.value
    if (!b || shape.value === 'box') return null
    return new Set(
      SHAPE_WALKS[shape.value](tuning.value, selection.value, b, fretCount.value).map(
        n => `${n.string}:${n.fret}`,
      ),
    )
  })

  // String lens: the horizontal-mastery exercise — every dot off the chosen
  // strings dims (one string or several, for string-pair drills). Purely a
  // filter over the core's dots; no theory here.
  const stringKeys = computed(() => {
    if (soloStrings.value.length === 0) return null
    const chosen = new Set(soloStrings.value.map(n => n - 1))
    return new Set(
      dots.value.filter(d => chosen.has(d.string)).map(d => `${d.string}:${d.fret}`),
    )
  })

  // Octave map: the root's octave geometry — connector lines from the core,
  // root dots stay lit, everything else dims.
  const octaveLinks = computed(() =>
    octaves.value === 'on'
      ? rootOctaveLinks(tuning.value, selection.value, fretCount.value)
      : null,
  )
  const octaveKeys = computed(() =>
    octaves.value === 'on'
      ? new Set(dots.value.filter(d => d.isRoot).map(d => `${d.string}:${d.fret}`))
      : null,
  )

  const overlayChords = computed(() =>
    mode.value === 'scale'
      ? diatonicChords({ mode: 'scale', root: root.value, typeId: scaleId.value }, spelling.value)
      : [],
  )
  const overlayChord = computed(() => {
    const m = /^(\d{1,2})-(.+)$/.exec(overlay.value)
    if (!m) return null
    return (
      overlayChords.value.find(c => c.degreeIndex === Number(m[1]) && c.typeId === m[2]) ?? null
    )
  })
  const overlaySelection = computed<Selection | null>(() =>
    overlayChord.value
      ? { mode: 'chord', root: overlayChord.value.root, typeId: overlayChord.value.typeId }
      : null,
  )
  // The overlay chord's dots, from the same core generator as the main dots —
  // the shared source for its board keys, roles, and guide tones.
  const overlayDots = computed(() =>
    overlaySelection.value
      ? getFretboardDots(tuning.value, overlaySelection.value, spelling.value, fretCount.value)
      : null,
  )
  // The overlay chord's board positions as "string:fret" keys.
  const overlayKeys = computed(() =>
    overlayDots.value ? new Set(overlayDots.value.map(d => `${d.string}:${d.fret}`)) : null,
  )

  // The scale each diatonic chord is read against — null outside scale mode.
  const scaleSelection = computed<ScaleSelection | null>(() =>
    mode.value === 'scale' ? { mode: 'scale', root: root.value, typeId: scaleId.value } : null,
  )
  // Overlay chords annotated with their roman numeral and (for 7-note
  // scales) harmonic function, straight from the core.
  const overlayAnalysis = computed(() => {
    const s = scaleSelection.value
    if (!s) return []
    return overlayChords.value.map(c => ({
      ...c,
      numeral: romanNumeral(c, s),
      fn: harmonicFunction(c, s),
    }))
  })
  // The active overlay chord's analysis, for the anatomy panel's header.
  const overlayInfo = computed(
    () =>
      overlayAnalysis.value.find(
        c =>
          overlayChord.value &&
          c.degreeIndex === overlayChord.value.degreeIndex &&
          c.typeId === overlayChord.value.typeId,
      ) ?? null,
  )

  // Guide-tone lens: only the 3rds and 7ths — the tones that define each
  // chord's sound — stay lit. Reads the overlay chord when one is active,
  // else the selection itself; the roles come from the core's dots.
  const guideKeys = computed(() => {
    if (guides.value !== 'on') return null
    const src = overlayDots.value ?? dots.value
    return new Set(
      src
        .filter(d => d.role === 'third' || d.role === 'seventh')
        .map(d => `${d.string}:${d.fret}`),
    )
  })
  // Whether the current target has guide tones at all (a power chord has
  // none) — drives both the clamp and the button's disabled state.
  const hasGuideTones = computed(() =>
    (overlayDots.value ?? dots.value).some(d => d.role === 'third' || d.role === 'seventh'),
  )

  // Tone-role coloring: dot key → role, in the same reference frame as the
  // guide lens (the overlay chord when active, else the selection). With an
  // overlay, only its member dots carry roles — never two frames at once.
  const dotRoles = computed(() => {
    if (roles.value !== 'on') return null
    const src = overlayDots.value ?? dots.value
    return new Map<string, ToneRole>(src.map(d => [`${d.string}:${d.fret}`, d.role]))
  })
  const ROLE_ORDER: ToneRole[] = ['root', 'third', 'fifth', 'seventh', 'extension']
  const presentRoles = computed(() => {
    if (dotRoles.value === null) return []
    const present = new Set(dotRoles.value.values())
    return ROLE_ORDER.filter(r => present.has(r))
  })
  // The staff's noteheads tinted the same way, keyed by sounding midi — a
  // pitch takes the role of any of its board positions (they agree, being
  // one pitch class); outside the frame it stays untinted.
  const pitchRoles = computed(() => {
    const byKey = dotRoles.value
    if (byKey === null) return null
    const out = new Map<number, ToneRole>()
    for (const p of staffPitches.value) {
      for (const pos of p.positions) {
        const role = byKey.get(`${pos.string}:${pos.fret}`)
        if (role) {
          out.set(p.midi, role)
          break
        }
      }
    }
    return out
  })

  // Chord anatomy: how the shown selection is built, in words — the overlay
  // chord's when one is active, matching the roles and guides frame.
  const anatomy = computed(() =>
    describeSelection(overlaySelection.value ?? selection.value, spelling.value),
  )

  // The one membership set the board dims by — the lenses are mutually
  // exclusive, so at most one of these is non-null.
  const lensKeys = computed(
    () => patternKeys.value ?? stringKeys.value ?? octaveKeys.value ?? guideKeys.value,
  )

  // Circle of fifths: where the selection sits (ring by its third), and —
  // in scale mode — which keys' triads live inside the scale.
  const circlePos = computed(() => circlePosition(selection.value))
  const circleDiatonic = computed(() =>
    scaleSelection.value ? diatonicOnCircle(scaleSelection.value) : null,
  )

  // A circle click selects that KEY: outer ring → the major key (major
  // triad / major scale), inner ring → the minor key (minor triad /
  // aeolian). Keeping an exotic type across roots is the root picker's job.
  function selectCircleKey(index: number, ring: 'major' | 'minor') {
    const key = CIRCLE_OF_FIFTHS[index]
    if (!key) return
    root.value = ring === 'major' ? key.major : key.minor
    if (mode.value === 'chord') chordId.value = ring === 'major' ? 'major' : 'minor'
    else scaleId.value = ring === 'major' ? 'major' : 'aeolian'
  }

  // What the Fretboard outlines: the rectangle only in box lens — a pattern
  // deliberately drifts outside it.
  const outlinedBox = computed(() => (shape.value === 'box' ? activeBox.value : null))

  // The position, string, octave, and guide lenses are four dim systems —
  // activating one deactivates the others.
  function setBox(index: number) {
    box.value = index
    if (index !== 0) {
      soloStrings.value = []
      octaves.value = 'off'
      guides.value = 'off'
    }
  }

  function setShape(value: RoomState['shape']) {
    shape.value = value
  }

  function setOverlay(value: string) {
    overlay.value = value
  }

  function toggleSoloString(n: number) {
    const chosen = new Set(soloStrings.value)
    if (chosen.has(n)) chosen.delete(n)
    else chosen.add(n)
    soloStrings.value = [...chosen].sort((a, b) => a - b)
    if (soloStrings.value.length) {
      box.value = 0
      octaves.value = 'off'
      guides.value = 'off'
    }
  }

  function clearSoloStrings() {
    soloStrings.value = []
  }

  function setOctaves(value: RoomState['octaves']) {
    octaves.value = value
    if (value === 'on') {
      box.value = 0
      soloStrings.value = []
      guides.value = 'off'
    }
  }

  function setGuides(value: RoomState['guides']) {
    guides.value = value
    if (value === 'on') {
      box.value = 0
      soloStrings.value = []
      octaves.value = 'off'
    }
  }

  // A changed selection, tuning, or fret count can shrink the box list or
  // drop the overlay chord out of the scale — clamp rather than point at
  // something stale. Immediate, so a cold-loaded URL that passed shape
  // validation but doesn't resolve against the actual selection is cleaned
  // up too (including one URL naming several mutually exclusive lenses:
  // position wins, then single-string, then octaves, then guides).
  watch(
    [selection, tuning, fretCount],
    () => {
      if (box.value > boxes.value.length) box.value = 0
      if (mode.value === 'scale' && overlay.value && overlayChord.value === null)
        overlay.value = ''
      if (mode.value === 'scale' && shape.value === 'sweep') shape.value = 'box'
      if (soloStrings.value.some(n => n > tuning.value.strings.length))
        soloStrings.value = soloStrings.value.filter(n => n <= tuning.value.strings.length)
      if (box.value !== 0) {
        soloStrings.value = []
        octaves.value = 'off'
        guides.value = 'off'
      } else if (soloStrings.value.length !== 0) {
        octaves.value = 'off'
        guides.value = 'off'
      } else if (octaves.value === 'on') {
        guides.value = 'off'
      }
      // A target with no 3rd or 7th (a power chord) has nothing to guide.
      if (guides.value === 'on' && !hasGuideTones.value) guides.value = 'off'
    },
    { immediate: true },
  )

  // Staff view: the neck's exact-pitch inventory (box-filtered when a
  // position is active), plus transient (never persisted) pin/identify
  // state — a pinned pitch and a ghost cell are mutually exclusive.
  const staffPitches = computed(() => {
    const all = selectionPitches(tuning.value, selection.value, spelling.value, fretCount.value)
    const keys = lensKeys.value
    if (keys)
      return all.filter(p => p.positions.some(pos => keys.has(`${pos.string}:${pos.fret}`)))
    const b = activeBox.value
    return b ? all.filter(p => p.positions.some(pos => dotInBox(pos, b))) : all
  })
  // Practice: the note pool the pattern player sequences — the chord's
  // arpeggio or the scale's one-octave run, and inside a position the box's
  // exact pitch inventory (whatever the board currently shows). In scale
  // mode the Arpeggio source swaps in the overlay chord's tones instead.
  const practicePool = computed(() => {
    if (mode.value === 'scale' && arp.value === 'on' && overlaySelection.value)
      return selectionMidiNotes(overlaySelection.value).midi
    return activeBox.value
      ? staffPitches.value.map(p => p.midi)
      : selectionMidiNotes(selection.value).midi
  })
  const practiceRun = computed(() => sequenceNotes(practicePool.value, pattern.value))

  // Progression practice harmonizes the current scale; null whenever the
  // core can't (chord mode, or a scale without exactly 7 tones).
  const progressionPreset = computed(
    () => PROGRESSION_PRESETS.find(p => p.id === prog.value) ?? PROGRESSION_PRESETS[0]!,
  )
  const progression = computed(() => {
    const s = scaleSelection.value
    if (!s) return null
    try {
      return progressionSteps(s, progressionPreset.value.degrees, {
        sevenths: sevenths.value === 'on',
        spelling: spelling.value,
        voiceLeading: voicing.value === 'smooth',
      })
    } catch {
      return null
    }
  })

  const focusedPitch = ref<number | null>(null)
  const ghostPos = ref<{ string: number; fret: number } | null>(null)
  const ghost = computed(() =>
    ghostPos.value
      ? {
          ...identifyPosition(
            tuning.value,
            ghostPos.value.string,
            ghostPos.value.fret,
            selection.value,
            spelling.value,
          ),
          string: ghostPos.value.string,
          fret: ghostPos.value.fret,
        }
      : null,
  )

  function focusPitch(midi: number) {
    ghostPos.value = null
    focusedPitch.value = focusedPitch.value === midi ? null : midi
  }

  function identifyCell(stringIndex: number, fret: number) {
    focusedPitch.value = null
    const g = ghostPos.value
    ghostPos.value =
      g && g.string === stringIndex && g.fret === fret
        ? null
        : { string: stringIndex, fret }
  }

  function clearPitchFocus() {
    focusedPitch.value = null
    ghostPos.value = null
  }

  // Any change to what the board shows invalidates the pinned pitch/ghost.
  // A new box or lens too: a pin outside it would fight two dim systems.
  watch([selection, tuning, fretCount, spelling, box, shape, soloStrings, octaves, guides], () =>
    clearPitchFocus(),
  )

  function setTuning(id: string) {
    tuningId.value = id
    offsets.value = []
  }

  function tune(stringIndex: number, delta: 1 | -1) {
    const next = [...fullOffsets.value]
    next[stringIndex] = (next[stringIndex] ?? 0) + delta
    offsets.value = next
  }

  const snapshot = computed<RoomState>(() => ({
    mode: mode.value,
    root: root.value,
    chordId: chordId.value,
    scaleId: scaleId.value,
    tuningId: tuningId.value,
    offsets: offsets.value,
    labelMode: labelMode.value,
    spelling: spelling.value,
    handedness: handedness.value,
    stringOrder: stringOrder.value,
    instrument: instrument.value,
    speed: speed.value,
    fretCount: fretCount.value,
    staff: staff.value,
    box: box.value,
    shape: shape.value,
    overlay: overlay.value,
    soloStrings: soloStrings.value,
    octaves: octaves.value,
    roles: roles.value,
    guides: guides.value,
    circle: circle.value,
    info: infoCard.value,
    anatomy: anatomyCard.value,
    pcard: practiceCard.value,
    practice: practice.value,
    pattern: pattern.value,
    arp: arp.value,
    prog: prog.value,
    sevenths: sevenths.value,
    voicing: voicing.value,
    feel: feel.value,
    cycle: cycle.value,
    tempo: tempo.value,
    meter: meter.value,
    sub: sub.value,
    droneVoice: droneVoice.value,
    droneMode: droneMode.value,
    droneLevel: droneLevel.value,
  }))

  watch(
    snapshot,
    s => {
      persist(s)
      reflectUrl(s)
    },
    { deep: true },
  )

  return {
    mode,
    root,
    chordId,
    scaleId,
    tuningId,
    offsets,
    labelMode,
    spelling,
    handedness,
    stringOrder,
    instrument,
    speed,
    fretCount,
    staff,
    box,
    shape,
    overlay,
    soloStrings,
    octaves,
    roles,
    guides,
    circle,
    infoCard,
    anatomyCard,
    practiceCard,
    practice,
    pattern,
    arp,
    prog,
    sevenths,
    voicing,
    feel,
    cycle,
    tempo,
    meter,
    sub,
    droneVoice,
    droneMode,
    droneLevel,
    practicePool,
    practiceRun,
    progressionPreset,
    progression,
    baseTuning,
    tuning,
    fullOffsets,
    isCustomTuning,
    selection,
    dots,
    info,
    staffPitches,
    focusedPitch,
    ghost,
    boxes,
    activeBox,
    outlinedBox,
    patternKeys,
    stringKeys,
    octaveKeys,
    octaveLinks,
    lensKeys,
    overlayChords,
    overlayChord,
    overlayKeys,
    overlayAnalysis,
    overlayInfo,
    guideKeys,
    hasGuideTones,
    dotRoles,
    presentRoles,
    pitchRoles,
    anatomy,
    circlePos,
    circleDiatonic,
    snapshot,
    setTuning,
    tune,
    focusPitch,
    identifyCell,
    clearPitchFocus,
    setBox,
    setShape,
    setOverlay,
    toggleSoloString,
    clearSoloStrings,
    setOctaves,
    setGuides,
    selectCircleKey,
  }
})
