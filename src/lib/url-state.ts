import {
  CHORD_TYPES,
  OVERLAY_CHORD_TYPE_IDS,
  PROGRESSION_PRESETS,
  ROOTS,
  SCALE_TYPES,
  SEQUENCE_PATTERN_IDS,
  TUNINGS,
  type SequencePatternId,
} from '@anunnakicosmocrew/handlebars'
import { INSTRUMENTS, SPEED_DEFAULT, type InstrumentId } from '../audio/engine.js'
import {
  METERS,
  SUBDIVISIONS,
  TEMPO_DEFAULT,
  TEMPO_MAX,
  TEMPO_MIN,
  type MeterId,
  type Subdivision,
} from '../audio/practice.js'

/**
 * Serializable room state. The URL carries only non-default values so links
 * stay short: ?root=Db&chord=maj7&tuning=drop-d. Chord vs scale mode is
 * implied by which of chord=/scale= is present.
 */
export type RoomState = {
  mode: 'chord' | 'scale'
  root: string
  chordId: string
  scaleId: string
  tuningId: string
  /** Per-string semitone offsets; [] means all zero. */
  offsets: number[]
  labelMode: 'names' | 'intervals'
  spelling: 'strict' | 'simple'
  handedness: 'right' | 'left'
  stringOrder: 'bass-bottom' | 'bass-top'
  instrument: InstrumentId
  /** Playback speed step, 0 (snail) … 4 (rabbit). */
  speed: number
  /** Number of frets shown on the board. */
  fretCount: FretCount
  /** Whether the notation panel is shown. */
  staff: 'show' | 'hide'
  /** Active position box, 1-based; 0 shows the whole neck. */
  box: number
  /** How an active position renders: rectangle or one of the walked shapes. */
  shape: ShapeLens
  /** Scale-mode chord overlay as "<degreeIndex>-<typeId>"; '' means none. */
  overlay: string
  /** String lens: 1-based strings shown alone, ascending; [] means off. */
  soloStrings: number[]
  /** Octave-map lens: root octave shapes linked across the neck. */
  octaves: 'off' | 'on'
  /** Tone-role coloring: dots tinted by root/third/fifth/seventh/extension. */
  roles: 'off' | 'on'
  /** Guide-tone lens: only the 3rds and 7ths stay lit. */
  guides: 'off' | 'on'
  /** Whether the circle-of-fifths panel is shown. */
  circle: 'show' | 'hide'
  /** Whether the selection-details card is shown. */
  info: 'show' | 'hide'
  /** Whether the how-it's-built card is shown. */
  anatomy: 'show' | 'hide'
  /** Whether the practice card is expanded (its mode lives in `practice`). */
  pcard: 'show' | 'hide'
  /** Practice panel: hidden, or open on one of its modes. */
  practice: PracticeTab
  /** Sequenced-run pattern for pattern practice. */
  pattern: SequencePatternId
  /** Pattern practice source in scale mode: the overlay chord's arpeggio. */
  arp: 'off' | 'on'
  /** Progression-practice preset id. */
  prog: string
  /** Whether progression practice harmonizes sevenths instead of triads. */
  sevenths: 'off' | 'on'
  /** Progression voicing: each chord led from the last, or all root position. */
  voicing: 'smooth' | 'root'
  /** How a progression bar sounds: one block chord, strums, or an arpeggio. */
  feel: 'block' | 'strum' | 'arpeggio'
  /** Key cycling: transpose the progression around the circle each loop. */
  cycle: 'off' | 'on'
  /** Practice tempo in BPM (metronome, patterns, progressions). */
  tempo: number
  /** Practice meter: beats per bar and accent placement. */
  meter: MeterId
  /** Metronome clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths. */
  sub: Subdivision
  /** Drone voicing: the tonic alone, or with its fifth. */
  droneVoice: 'root' | 'fifth'
  /** Drone character: sustained pedal tone or tanpura-style pulse. */
  droneMode: 'sustain' | 'pulse'
  /** Drone volume, 0–100. */
  droneLevel: number
}

export const PRACTICE_TABS = ['off', 'quiz', 'patterns', 'progression'] as const
export type PracticeTab = (typeof PRACTICE_TABS)[number]

export const SHAPE_LENSES = ['box', 'pattern', 'diagonal', 'run', 'sweep'] as const
export type ShapeLens = (typeof SHAPE_LENSES)[number]

export const FRET_COUNTS = [12, 20, 24] as const
export type FretCount = (typeof FRET_COUNTS)[number]

export const DEFAULT_STATE: RoomState = {
  mode: 'chord',
  root: 'E',
  chordId: 'major',
  scaleId: 'major',
  tuningId: 'standard',
  offsets: [],
  labelMode: 'names',
  spelling: 'strict',
  handedness: 'right',
  stringOrder: 'bass-bottom',
  instrument: 'nylon',
  speed: SPEED_DEFAULT,
  fretCount: 12,
  staff: 'show',
  box: 0,
  shape: 'box',
  overlay: '',
  soloStrings: [],
  octaves: 'off',
  roles: 'off',
  guides: 'off',
  circle: 'show',
  info: 'show',
  anatomy: 'show',
  pcard: 'show',
  practice: 'off',
  pattern: 'asc',
  arp: 'off',
  prog: 'i-iv-v',
  sevenths: 'off',
  voicing: 'smooth',
  feel: 'block',
  cycle: 'off',
  tempo: TEMPO_DEFAULT,
  meter: '4/4',
  sub: 1,
  droneVoice: 'root',
  droneMode: 'sustain',
  droneLevel: 60,
}

const VALID_ROOTS = new Set(ROOTS.map(r => r.root))
const VALID_CHORDS = new Set(CHORD_TYPES.map(c => c.id))
const VALID_SCALES = new Set(SCALE_TYPES.map(s => s.id))
const VALID_TUNINGS = new Set(TUNINGS.map(t => t.id))
const VALID_OVERLAY_TYPES = new Set<string>(OVERLAY_CHORD_TYPE_IDS)

/** "<degreeIndex>-<typeId>" with a plausible degree and a curated type. */
const OVERLAY_RE = /^([1-9]|1[0-2])-(.+)$/

function parseOverlay(v: string | null): string | undefined {
  if (!v) return undefined
  const m = OVERLAY_RE.exec(v)
  return m && VALID_OVERLAY_TYPES.has(m[2]!) ? v : undefined
}

const oneOf =
  <T extends string>(...values: T[]) =>
  (v: string | null): T | undefined =>
    values.includes(v as T) ? (v as T) : undefined

function parseOffsets(v: string | null): number[] | undefined {
  if (!v) return undefined
  const segments = v.split(',')
  if (segments.some(s => !/^-?\d+$/.test(s))) return undefined
  const parts = segments.map(Number)
  if (parts.some(n => Math.abs(n) > 12)) return undefined
  return parts.every(n => n === 0) ? [] : parts
}

/** Parse a query string into the state fields it validly specifies. */
export function parseQuery(search: string): Partial<RoomState> {
  const q = new URLSearchParams(search)
  const out: Partial<RoomState> = {}
  const root = q.get('root')
  if (root && VALID_ROOTS.has(root)) out.root = root
  const chord = q.get('chord')
  const scale = q.get('scale')
  if (chord && VALID_CHORDS.has(chord)) {
    out.mode = 'chord'
    out.chordId = chord
  } else if (scale && VALID_SCALES.has(scale)) {
    out.mode = 'scale'
    out.scaleId = scale
  }
  const tuning = q.get('tuning')
  if (tuning && VALID_TUNINGS.has(tuning)) out.tuningId = tuning
  const offsets = parseOffsets(q.get('offsets'))
  if (offsets !== undefined) out.offsets = offsets
  const labels = oneOf('names', 'intervals')(q.get('labels'))
  if (labels) out.labelMode = labels
  const spelling = oneOf('strict', 'simple')(q.get('spelling'))
  if (spelling) out.spelling = spelling
  const hand = oneOf('right', 'left')(q.get('hand'))
  if (hand) out.handedness = hand
  const bass = oneOf('bottom', 'top')(q.get('bass'))
  if (bass) out.stringOrder = bass === 'top' ? 'bass-top' : 'bass-bottom'
  const instrument = q.get('instrument')
  if (instrument && INSTRUMENTS.some(i => i.id === instrument))
    out.instrument = instrument as InstrumentId
  const speed = q.get('speed')
  if (speed && /^[0-4]$/.test(speed)) out.speed = Number(speed)
  const frets = q.get('frets')
  if (frets && FRET_COUNTS.some(f => String(f) === frets))
    out.fretCount = Number(frets) as FretCount
  const staff = oneOf('show', 'hide')(q.get('staff'))
  if (staff) out.staff = staff
  // Shape-only validation: 1..24 is the most boxes any selection can have
  // (chromatic on a 24-fret neck); the store clamps against the actual count.
  const box = q.get('box')
  if (box && /^([1-9]|1\d|2[0-4])$/.test(box)) out.box = Number(box)
  const shape = oneOf(...SHAPE_LENSES)(q.get('shape'))
  if (shape) out.shape = shape
  // Shape-only: 8 covers any plausible string count; the store clamps.
  const solo = q.get('string')
  if (solo && /^[1-8](,[1-8])*$/.test(solo))
    out.soloStrings = [...new Set(solo.split(',').map(Number))].sort((a, b) => a - b)
  if (q.get('octaves') === 'on') out.octaves = 'on'
  if (q.get('roles') === 'on') out.roles = 'on'
  if (q.get('guides') === 'on') out.guides = 'on'
  const circle = oneOf('show', 'hide')(q.get('circle'))
  if (circle) out.circle = circle
  const info = oneOf('show', 'hide')(q.get('info'))
  if (info) out.info = info
  const anatomy = oneOf('show', 'hide')(q.get('anatomy'))
  if (anatomy) out.anatomy = anatomy
  const pcard = oneOf('show', 'hide')(q.get('pcard'))
  if (pcard) out.pcard = pcard
  const practice = oneOf(...PRACTICE_TABS.filter(t => t !== 'off'))(q.get('practice'))
  if (practice) out.practice = practice
  const pattern = oneOf(...SEQUENCE_PATTERN_IDS)(q.get('pattern'))
  if (pattern) out.pattern = pattern
  if (q.get('arp') === 'on') out.arp = 'on'
  const prog = q.get('prog')
  if (prog && PROGRESSION_PRESETS.some(p => p.id === prog)) out.prog = prog
  if (q.get('sevenths') === 'on') out.sevenths = 'on'
  if (q.get('voicing') === 'root') out.voicing = 'root'
  const feel = oneOf('block', 'strum', 'arpeggio')(q.get('feel'))
  if (feel) out.feel = feel
  if (q.get('cycle') === 'on') out.cycle = 'on'
  const tempo = q.get('tempo')
  if (tempo && /^\d+$/.test(tempo) && Number(tempo) >= TEMPO_MIN && Number(tempo) <= TEMPO_MAX)
    out.tempo = Number(tempo)
  const meter = q.get('meter')
  if (meter && METERS.some(m => m.id === meter)) out.meter = meter as MeterId
  const sub = q.get('sub')
  if (sub && SUBDIVISIONS.some(s => String(s) === sub)) out.sub = Number(sub) as Subdivision
  const dvoice = oneOf('root', 'fifth')(q.get('dvoice'))
  if (dvoice) out.droneVoice = dvoice
  const dmode = oneOf('sustain', 'pulse')(q.get('dmode'))
  if (dmode) out.droneMode = dmode
  const dvol = q.get('dvol')
  if (dvol && /^\d+$/.test(dvol) && Number(dvol) <= 100) out.droneLevel = Number(dvol)
  const overlay = parseOverlay(q.get('overlay'))
  if (overlay !== undefined) out.overlay = overlay
  return out
}

/** Build the query string for a state, omitting every default. */
export function buildQuery(state: RoomState): string {
  const q = new URLSearchParams()
  if (state.root !== DEFAULT_STATE.root) q.set('root', state.root)
  if (state.mode === 'chord') {
    if (state.chordId !== DEFAULT_STATE.chordId) q.set('chord', state.chordId)
  } else {
    q.set('scale', state.scaleId)
  }
  if (state.tuningId !== DEFAULT_STATE.tuningId) q.set('tuning', state.tuningId)
  if (state.offsets.some(o => o !== 0)) q.set('offsets', state.offsets.join(','))
  if (state.labelMode !== DEFAULT_STATE.labelMode) q.set('labels', state.labelMode)
  if (state.spelling !== DEFAULT_STATE.spelling) q.set('spelling', state.spelling)
  if (state.handedness !== DEFAULT_STATE.handedness) q.set('hand', state.handedness)
  if (state.stringOrder !== DEFAULT_STATE.stringOrder)
    q.set('bass', state.stringOrder === 'bass-top' ? 'top' : 'bottom')
  if (state.instrument !== DEFAULT_STATE.instrument) q.set('instrument', state.instrument)
  if (state.speed !== DEFAULT_STATE.speed) q.set('speed', String(state.speed))
  if (state.fretCount !== DEFAULT_STATE.fretCount) q.set('frets', String(state.fretCount))
  if (state.staff !== DEFAULT_STATE.staff) q.set('staff', state.staff)
  if (state.box !== DEFAULT_STATE.box) {
    q.set('box', String(state.box))
    // The shape lens only means anything while a position is active.
    if (state.shape !== DEFAULT_STATE.shape) q.set('shape', state.shape)
  }
  if (state.soloStrings.length) q.set('string', state.soloStrings.join(','))
  if (state.octaves !== DEFAULT_STATE.octaves) q.set('octaves', state.octaves)
  if (state.roles !== DEFAULT_STATE.roles) q.set('roles', state.roles)
  if (state.guides !== DEFAULT_STATE.guides) q.set('guides', state.guides)
  if (state.circle !== DEFAULT_STATE.circle) q.set('circle', state.circle)
  if (state.info !== DEFAULT_STATE.info) q.set('info', state.info)
  if (state.anatomy !== DEFAULT_STATE.anatomy) q.set('anatomy', state.anatomy)
  if (state.pcard !== DEFAULT_STATE.pcard) q.set('pcard', state.pcard)
  if (state.practice !== DEFAULT_STATE.practice) {
    q.set('practice', state.practice)
    // Each practice mode's settings only mean anything on its own tab.
    if (state.practice === 'patterns') {
      if (state.pattern !== DEFAULT_STATE.pattern) q.set('pattern', state.pattern)
      if (state.arp !== DEFAULT_STATE.arp) q.set('arp', state.arp)
    }
    if (state.practice === 'progression') {
      if (state.prog !== DEFAULT_STATE.prog) q.set('prog', state.prog)
      if (state.sevenths !== DEFAULT_STATE.sevenths) q.set('sevenths', state.sevenths)
      if (state.voicing !== DEFAULT_STATE.voicing) q.set('voicing', state.voicing)
      if (state.feel !== DEFAULT_STATE.feel) q.set('feel', state.feel)
      if (state.cycle !== DEFAULT_STATE.cycle) q.set('cycle', state.cycle)
    }
    // The drone and metronome only sound while the panel is open.
    if (state.meter !== DEFAULT_STATE.meter) q.set('meter', state.meter)
    if (state.sub !== DEFAULT_STATE.sub) q.set('sub', String(state.sub))
    if (state.droneVoice !== DEFAULT_STATE.droneVoice) q.set('dvoice', state.droneVoice)
    if (state.droneMode !== DEFAULT_STATE.droneMode) q.set('dmode', state.droneMode)
    if (state.droneLevel !== DEFAULT_STATE.droneLevel) q.set('dvol', String(state.droneLevel))
  }
  if (state.tempo !== DEFAULT_STATE.tempo) q.set('tempo', String(state.tempo))
  // The overlay only means anything while a scale is selected.
  if (state.mode === 'scale' && state.overlay) q.set('overlay', state.overlay)
  return q.toString()
}
