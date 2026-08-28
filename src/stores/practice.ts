import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  CIRCLE_OF_FIFTHS,
  ROOTS,
  formatDegree,
  formatNote,
  notePositions,
  selectionMidiNotes,
} from '@anunnakicosmocrew/handlebars'
import { audioEngine } from '../audio/engine.js'
import {
  TAP_RESET_MS,
  beatSeconds,
  bpmFromTaps,
  drone,
  meterOf,
  metronome,
  type DroneOptions,
  type MetronomeOptions,
} from '../audio/practice.js'
import { useRoomStore } from './room.js'

export type QuizKind = 'note' | 'degree' | 'dot'

export type QuizQuestion =
  | { kind: 'note'; target: string; keys: Set<string> }
  | { kind: 'degree'; target: string; keys: Set<string> }
  | { kind: 'dot'; key: string; answer: string; choices: string[] }

function randomOf<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Everything transient about practicing: the quiz question on the table, the
 * running pattern/progression playback, and the drone + metronome switches.
 * Deliberately never persisted — a reload starts a fresh session. The
 * persisted practice *settings* (tab, pattern, preset, tempo) live in the
 * room store.
 */
export const usePracticeStore = defineStore('practice', () => {
  const room = useRoomStore()

  // ---- playback (patterns + progressions) ----
  const playing = ref<'off' | 'pattern' | 'progression'>('off')
  const stepIndex = ref(-1)
  let stepTimer: ReturnType<typeof setTimeout> | undefined
  let savedOverlay: string | null = null

  // The sounding pattern note — the board rings every position of it.
  const liveMidi = computed(() =>
    playing.value === 'pattern' && stepIndex.value >= 0
      ? (room.practiceRun[stepIndex.value] ?? null)
      : null,
  )
  const progressionStep = computed(() =>
    playing.value === 'progression' && stepIndex.value >= 0
      ? (room.progression?.[stepIndex.value] ?? null)
      : null,
  )
  /** The count-in bar before the first note, once a player has started. */
  const countingIn = computed(() => playing.value !== 'off' && stepIndex.value === -1)

  const clickOptions = computed<MetronomeOptions>(() => ({
    bpm: room.tempo,
    meter: room.meter,
    subdivision: room.sub,
  }))

  /** One accented count-in bar; returns the ms until it ends. */
  function countInMs(): number {
    const seconds = metronome.countIn(audioEngine.ensureContext(), clickOptions.value)
    return Math.round(seconds * 1000)
  }

  function stopPlayback() {
    clearTimeout(stepTimer)
    stepTimer = undefined
    if (playing.value === 'progression' && savedOverlay !== null) {
      room.overlay = savedOverlay
      savedOverlay = null
    }
    if (playing.value !== 'off') audioEngine.stop()
    playing.value = 'off'
    stepIndex.value = -1
  }

  function startPattern() {
    stopPlayback()
    if (room.practiceRun.length === 0) return
    playing.value = 'pattern'
    stepIndex.value = -1
    const step = () => {
      if (playing.value !== 'pattern') return
      const next = stepIndex.value + 1
      if (next >= room.practiceRun.length) {
        stopPlayback()
        return
      }
      stepIndex.value = next
      const beat = beatSeconds(room.tempo)
      audioEngine.playNote(room.practiceRun[next]!, room.instrument, beat * 0.9).catch(() => {
        /* audio unavailable — the dots still light in order */
      })
      stepTimer = setTimeout(step, beat * 1000)
    }
    stepTimer = setTimeout(step, countInMs())
  }

  function startProgression() {
    stopPlayback()
    const steps = room.progression
    if (!steps || steps.length === 0) return
    playing.value = 'progression'
    stepIndex.value = -1
    savedOverlay = room.overlay
    const bar = () => {
      if (playing.value !== 'progression') return
      const steps2 = room.progression
      if (!steps2 || steps2.length === 0) {
        stopPlayback()
        return
      }
      const next = (stepIndex.value + 1) % steps2.length
      // Key cycling: when the loop wraps, move the whole progression a
      // fifth clockwise around the circle before playing bar one again.
      if (next === 0 && stepIndex.value >= 0 && room.cycle === 'on') advanceKey()
      stepIndex.value = next
      const s = (room.progression ?? steps2)[next]
      if (!s) {
        stopPlayback()
        return
      }
      // Ride the existing overlay machinery: the board rings the bar's chord
      // and the pickers/panels follow along. Restored when playback stops.
      room.overlay = s.chord ? `${s.chord.degreeIndex}-${s.chord.typeId}` : ''
      // One chord per bar of the chosen meter, in the chosen feel.
      const beats = meterOf(room.meter).beats
      const beat = beatSeconds(room.tempo)
      audioEngine.playBar(s.midi, room.instrument, room.feel, beats, beat).catch(() => {
        /* audio unavailable — the visuals still step through the changes */
      })
      stepTimer = setTimeout(bar, Math.round(beats * beat * 1000))
    }
    stepTimer = setTimeout(bar, countInMs())
  }

  // The next key clockwise on the circle, on the ring the selection already
  // sits on — same scale type, new root. The invalidation watcher is told to
  // let this one through instead of stopping the playback it serves.
  let cyclingKey = false
  function advanceKey() {
    const pos = room.circlePos
    const key = CIRCLE_OF_FIFTHS[(pos.index + 1) % 12]
    if (pos.index < 0 || !key) return
    cyclingKey = true
    room.root = pos.ring === 'minor' ? key.minor : key.major
  }

  // ---- quiz ----
  const quizKind = ref<QuizKind>('note')
  const question = ref<QuizQuestion | null>(null)
  const score = ref({ right: 0, asked: 0 })
  const feedback = ref<'idle' | 'right' | 'wrong'>('idle')
  const reveal = ref<Set<string> | null>(null)
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined

  const quizActive = computed(() => room.practice === 'quiz' && question.value !== null)
  // While answering, the board keeps its secrets: labels off, dots inert so
  // taps land on the cells underneath (which the quiz swallows) — for every
  // question kind, or a dot click during name-that-dot would still pin and
  // play its pitch. A wrong answer flips both back to teach.
  const hideLabels = computed(() => quizActive.value && feedback.value !== 'wrong')
  const passiveDots = computed(() => hideLabels.value)
  // What the board dims to during a quiz: the one mystery dot, or the
  // revealed answer key after a miss.
  const boardKeys = computed(() => {
    if (!quizActive.value) return null
    if (feedback.value === 'wrong' && reveal.value) return reveal.value
    const q = question.value
    return q?.kind === 'dot' ? new Set([q.key]) : null
  })
  // The reveal as positions to ring — answer spots exist whether or not the
  // current selection puts a dot there (find-the-note usually doesn't).
  const boardMarks = computed(() => {
    if (feedback.value !== 'wrong' || !reveal.value) return null
    return [...reveal.value].map(k => {
      const [s, f] = k.split(':').map(Number)
      return { string: s!, fret: f! }
    })
  })

  function makeQuestion(): QuizQuestion | null {
    if (quizKind.value === 'note') {
      const root = randomOf([...ROOTS]).root
      const keys = new Set(
        notePositions(room.tuning, root, room.fretCount).map(p => `${p.string}:${p.fret}`),
      )
      return { kind: 'note', target: formatNote(root), keys }
    }
    if (room.dots.length === 0) return null
    if (quizKind.value === 'degree') {
      const degree = randomOf([...new Set(room.dots.map(d => d.degree))])
      const keys = new Set(
        room.dots.filter(d => d.degree === degree).map(d => `${d.string}:${d.fret}`),
      )
      return { kind: 'degree', target: formatDegree(degree), keys }
    }
    const dot = randomOf([...room.dots])
    const answer = formatNote(dot.note)
    const others = shuffled([...new Set(room.dots.map(d => formatNote(d.note)))].filter(
      n => n !== answer,
    )).slice(0, 3)
    return {
      kind: 'dot',
      key: `${dot.string}:${dot.fret}`,
      answer,
      choices: shuffled([answer, ...others]),
    }
  }

  function next() {
    clearTimeout(feedbackTimer)
    feedback.value = 'idle'
    reveal.value = null
    question.value = makeQuestion()
  }

  function settle(correct: boolean, answerKeys: Set<string> | null) {
    score.value = {
      right: score.value.right + (correct ? 1 : 0),
      asked: score.value.asked + 1,
    }
    if (correct) {
      feedback.value = 'right'
      feedbackTimer = setTimeout(next, 900)
    } else {
      feedback.value = 'wrong'
      reveal.value = answerKeys
    }
  }

  /** A board tap during a tap-the-board question; ignored otherwise. */
  function answerCell(stringIndex: number, fret: number): boolean {
    const q = question.value
    if (!quizActive.value || !q || q.kind === 'dot' || feedback.value !== 'idle') {
      return quizActive.value
    }
    settle(q.keys.has(`${stringIndex}:${fret}`), q.keys)
    return true
  }

  /** A multiple-choice pick during a name-that-dot question. */
  function answerChoice(name: string) {
    const q = question.value
    if (!q || q.kind !== 'dot' || feedback.value !== 'idle') return
    settle(name === q.answer, new Set([q.key]))
  }

  function resetQuiz() {
    clearTimeout(feedbackTimer)
    question.value = null
    feedback.value = 'idle'
    reveal.value = null
  }

  function startQuiz(kind?: QuizKind) {
    if (kind) quizKind.value = kind
    score.value = { right: 0, asked: 0 }
    next()
  }

  // ---- drone + metronome ----
  const droneOn = ref(false)
  const metronomeOn = ref(false)
  // The sounding beat within the bar (0-based), -1 while nothing clicks —
  // drives the visual pulse for both the metronome and the count-in bar.
  const metronomeBeat = ref(-1)
  metronome.onBeat = beatInBar => {
    // Only while something actually clicks — a beat announced just before a
    // stop must not overwrite the reset to -1.
    if (metronomeOn.value || countingIn.value) metronomeBeat.value = beatInBar
  }

  // The tonic an octave below the Play voicing — deep enough to sit under
  // anything the board plays.
  const droneMidi = computed(() => selectionMidiNotes(room.selection).midi[0]! - 12)
  const droneOptions = computed<DroneOptions>(() => ({
    voice: room.droneVoice,
    mode: room.droneMode,
    level: room.droneLevel / 100,
  }))

  function toggleDrone() {
    const ctx = audioEngine.ensureContext()
    if (droneOn.value) drone.stop(ctx)
    else drone.start(ctx, droneMidi.value, droneOptions.value)
    droneOn.value = !droneOn.value
  }

  function toggleMetronome() {
    if (metronomeOn.value) {
      metronome.stop()
      metronomeBeat.value = -1
    } else {
      metronome.start(audioEngine.ensureContext(), clickOptions.value)
    }
    metronomeOn.value = !metronomeOn.value
  }

  // Tap tempo: a run of taps sets the shared BPM; a long pause starts over.
  let taps: number[] = []
  function tapTempo(now = Date.now()) {
    const last = taps[taps.length - 1]
    if (last !== undefined && now - last > TAP_RESET_MS) taps = []
    taps.push(now)
    taps = taps.slice(-6)
    const bpm = bpmFromTaps(taps)
    if (bpm !== null) room.tempo = bpm
  }

  // The running drone follows the tonic and its settings live; the running
  // metronome picks up tempo/meter/subdivision on its next beat.
  watch([droneMidi, droneOptions], ([midi, opts]) => {
    if (droneOn.value) drone.update(audioEngine.ensureContext(), midi, opts)
  })
  watch(clickOptions, opts => metronome.setOptions(opts))

  // Anything that changes what's on the board (or which practice tab is
  // open) invalidates the running playback and the open question.
  watch(
    [
      () => room.practice,
      () => room.selection,
      () => room.tuning,
      () => room.fretCount,
      () => room.pattern,
      () => room.arp,
      () => room.box,
      () => room.prog,
      () => room.sevenths,
    ],
    () => {
      // A root change the key cycler itself made is the playback, not a
      // reason to stop it.
      if (cyclingKey) {
        cyclingKey = false
        return
      }
      stopPlayback()
      resetQuiz()
    },
  )

  // An overlay change redefines the arpeggio pool, so a running pattern
  // stops — but never the progression player, which writes the overlay
  // itself bar by bar.
  watch(
    () => room.overlay,
    () => {
      if (playing.value === 'pattern') stopPlayback()
    },
  )

  // Closing the panel silences everything, drone and metronome included.
  watch(
    () => room.practice,
    tab => {
      if (tab !== 'off') return
      if (droneOn.value) toggleDrone()
      if (metronomeOn.value) toggleMetronome()
    },
  )

  return {
    playing,
    stepIndex,
    liveMidi,
    progressionStep,
    countingIn,
    startPattern,
    startProgression,
    stopPlayback,
    tapTempo,
    quizKind,
    question,
    score,
    feedback,
    reveal,
    quizActive,
    hideLabels,
    passiveDots,
    boardKeys,
    boardMarks,
    startQuiz,
    next,
    answerCell,
    answerChoice,
    resetQuiz,
    droneOn,
    metronomeOn,
    metronomeBeat,
    toggleDrone,
    toggleMetronome,
  }
})
