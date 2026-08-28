import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { notePositions } from '@anunnakicosmocrew/handlebars'
import { useRoomStore } from '../src/stores/room.js'
import { usePracticeStore } from '../src/stores/practice.js'
import { audioEngine } from '../src/audio/engine.js'
import { drone, metronome } from '../src/audio/practice.js'

vi.mock('../src/audio/engine.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../src/audio/engine.js')>()
  return {
    ...mod,
    audioEngine: {
      ensureContext: vi.fn(() => ({}) as AudioContext),
      playNote: vi.fn(async () => {}),
      playBar: vi.fn(async () => {}),
      play: vi.fn(async () => 0),
      stop: vi.fn(),
    },
  }
})

vi.mock('../src/audio/practice.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../src/audio/practice.js')>()
  return {
    ...mod,
    drone: { start: vi.fn(), stop: vi.fn(), update: vi.fn() },
    metronome: {
      start: vi.fn(),
      stop: vi.fn(),
      setOptions: vi.fn(),
      // The real contract: a bar plus the lead-in before its first click.
      countIn: vi.fn(
        (_ctx: unknown, opts: { bpm: number; meter: string }) =>
          mod.meterOf(opts.meter as never).beats * mod.beatSeconds(opts.bpm) +
          mod.SCHEDULE_LEAD,
      ),
    },
  }
})

function freshStores() {
  setActivePinia(createPinia())
  return { room: useRoomStore(), practice: usePracticeStore() }
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('quiz', () => {
  it('asks for a note and scores a correct board tap', async () => {
    const { room, practice } = freshStores()
    room.practice = 'quiz'
    vi.spyOn(Math, 'random').mockReturnValue(0) // first root: C
    practice.startQuiz('note')
    const q = practice.question!
    expect(q.kind).toBe('note')
    expect(q).toMatchObject({ target: 'C' })
    const positions = notePositions(room.tuning, 'C', room.fretCount)
    expect(practice.hideLabels).toBe(true)
    expect(practice.passiveDots).toBe(true)
    const hit = positions[0]!
    expect(practice.answerCell(hit.string, hit.fret)).toBe(true)
    expect(practice.feedback).toBe('right')
    expect(practice.score).toEqual({ right: 1, asked: 1 })
    // the next question arrives on its own after the flash
    vi.advanceTimersByTime(1000)
    expect(practice.feedback).toBe('idle')
    expect(practice.question).not.toBe(null)
    expect(practice.score).toEqual({ right: 1, asked: 1 })
  })

  it('reveals the answer key on a miss and waits for Next', () => {
    const { room, practice } = freshStores()
    room.practice = 'quiz'
    vi.spyOn(Math, 'random').mockReturnValue(0)
    practice.startQuiz('note')
    const q = practice.question!
    if (q.kind === 'dot') throw new Error('unexpected kind')
    // string 0 fret 1 is F on standard tuning — never a C position
    expect(q.keys.has('0:1')).toBe(false)
    practice.answerCell(0, 1)
    expect(practice.feedback).toBe('wrong')
    expect(practice.score).toEqual({ right: 0, asked: 1 })
    expect(practice.boardKeys).toBe(practice.reveal)
    expect(practice.hideLabels).toBe(false) // the reveal teaches, labels on
    // every answer position gets a visible ring, dot there or not
    expect(practice.boardMarks).toHaveLength(q.keys.size)
    expect(practice.boardMarks![0]).toEqual({
      string: expect.any(Number),
      fret: expect.any(Number),
    })
    vi.advanceTimersByTime(5000)
    expect(practice.feedback).toBe('wrong') // no auto-advance on a miss
    practice.next()
    expect(practice.feedback).toBe('idle')
  })

  it('quizzes degrees against the current selection dots', () => {
    const { room, practice } = freshStores()
    room.practice = 'quiz'
    vi.spyOn(Math, 'random').mockReturnValue(0)
    practice.startQuiz('degree')
    const q = practice.question!
    if (q.kind !== 'degree') throw new Error('unexpected kind')
    expect(q.keys.size).toBeGreaterThan(0)
    const [key] = q.keys
    const [s, f] = key!.split(':').map(Number)
    practice.answerCell(s!, f!)
    expect(practice.feedback).toBe('right')
  })

  it('plays name-that-dot through the choice buttons, not the board', () => {
    const { room, practice } = freshStores()
    room.practice = 'quiz'
    practice.startQuiz('dot')
    const q = practice.question!
    if (q.kind !== 'dot') throw new Error('unexpected kind')
    expect(q.choices).toContain(q.answer)
    expect(new Set(q.choices).size).toBe(q.choices.length)
    // the one mystery dot is the only lit key; dots are inert here too, so
    // a board tap can't pin and sound the answer
    expect(practice.boardKeys).toEqual(new Set([q.key]))
    expect(practice.passiveDots).toBe(true)
    // a board tap is swallowed but not scored
    expect(practice.answerCell(0, 0)).toBe(true)
    expect(practice.score).toEqual({ right: 0, asked: 0 })
    practice.answerChoice(q.answer)
    expect(practice.feedback).toBe('right')
    expect(practice.score).toEqual({ right: 1, asked: 1 })
  })

  it('drops the open question when the selection changes', async () => {
    const { room, practice } = freshStores()
    room.practice = 'quiz'
    practice.startQuiz('note')
    expect(practice.question).not.toBe(null)
    room.root = 'A'
    await nextTick()
    expect(practice.question).toBe(null)
    expect(practice.quizActive).toBe(false)
  })
})

describe('pattern playback', () => {
  it('counts in a bar, then steps through the run and stops at the end', async () => {
    const { room, practice } = freshStores()
    room.practice = 'patterns'
    // default E major chord → arpeggio 52-56-59, 100 BPM → 600ms steps
    practice.startPattern()
    expect(practice.playing).toBe('pattern')
    expect(practice.countingIn).toBe(true)
    expect(practice.liveMidi).toBe(null)
    expect(metronome.countIn).toHaveBeenCalledWith(expect.anything(), {
      bpm: 100,
      meter: '4/4',
      subdivision: 1,
    })
    expect(audioEngine.playNote).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2450) // a 4/4 count-in bar at 100 BPM, lead-in included
    expect(practice.countingIn).toBe(false)
    expect(practice.liveMidi).toBe(52)
    expect(audioEngine.playNote).toHaveBeenCalledWith(52, 'nylon', expect.any(Number))
    vi.advanceTimersByTime(600)
    expect(practice.liveMidi).toBe(56)
    vi.advanceTimersByTime(600)
    expect(practice.liveMidi).toBe(59)
    vi.advanceTimersByTime(600)
    expect(practice.playing).toBe('off')
    expect(practice.liveMidi).toBe(null)
    expect(audioEngine.playNote).toHaveBeenCalledTimes(3)
  })

  it('counts in a bar of the chosen meter', () => {
    const { room, practice } = freshStores()
    room.practice = 'patterns'
    room.meter = '3/4'
    practice.startPattern()
    vi.advanceTimersByTime(1849) // 3 beats at 100 BPM, plus the lead-in
    expect(practice.liveMidi).toBe(null)
    vi.advanceTimersByTime(1)
    expect(practice.liveMidi).toBe(52)
  })

  it('halts when the board changes underneath it', async () => {
    const { room, practice } = freshStores()
    room.practice = 'patterns'
    practice.startPattern()
    expect(practice.playing).toBe('pattern')
    room.pattern = 'desc'
    await nextTick()
    expect(practice.playing).toBe('off')
  })
})

describe('progression playback', () => {
  it('loops the bars, riding the overlay, and restores it on stop', async () => {
    const { room, practice } = freshStores()
    room.mode = 'scale'
    room.root = 'C'
    room.practice = 'progression'
    await nextTick()
    practice.startProgression()
    expect(practice.playing).toBe('progression')
    expect(practice.countingIn).toBe(true)
    vi.advanceTimersByTime(2450) // count-in bar
    expect(practice.stepIndex).toBe(0)
    expect(room.overlay).toBe('1-major')
    expect(audioEngine.playBar).toHaveBeenCalledWith([48, 52, 55], 'nylon', 'block', 4, 0.6)
    // 4 beats per bar at 100 BPM = 2400ms
    vi.advanceTimersByTime(2400)
    expect(practice.stepIndex).toBe(1)
    expect(room.overlay).toBe('4-major')
    vi.advanceTimersByTime(2400)
    expect(room.overlay).toBe('5-major')
    vi.advanceTimersByTime(2400)
    expect(practice.stepIndex).toBe(0) // I–IV–V wraps around
    practice.stopPlayback()
    expect(room.overlay).toBe('')
    expect(practice.playing).toBe('off')
  })

  it('refuses to start without a harmonizable scale', () => {
    const { room, practice } = freshStores()
    room.practice = 'progression'
    practice.startProgression() // chord mode: progression is null
    expect(practice.playing).toBe('off')
    expect(audioEngine.playBar).not.toHaveBeenCalled()
  })

  it('plays bars in the chosen feel and meter', async () => {
    const { room, practice } = freshStores()
    room.mode = 'scale'
    room.root = 'C'
    room.practice = 'progression'
    room.feel = 'arpeggio'
    room.meter = '3/4'
    await nextTick()
    practice.startProgression()
    vi.advanceTimersByTime(1850) // 3/4 count-in
    expect(audioEngine.playBar).toHaveBeenCalledWith([48, 52, 55], 'nylon', 'arpeggio', 3, 0.6)
  })

  it('cycles the key a fifth clockwise each loop without stopping', async () => {
    const { room, practice } = freshStores()
    room.mode = 'scale'
    room.root = 'C'
    room.practice = 'progression'
    room.cycle = 'on'
    await nextTick()
    practice.startProgression()
    vi.advanceTimersByTime(2450) // count-in → bar 1 of 3
    expect(room.root).toBe('C')
    vi.advanceTimersByTime(3 * 2400) // through IV and V, wrapping to bar 1
    expect(room.root).toBe('G')
    expect(practice.playing).toBe('progression')
    expect(practice.stepIndex).toBe(0)
    expect(room.overlay).toBe('1-major')
    // the watcher lets the cycler's own root change through
    await nextTick()
    expect(practice.playing).toBe('progression')
    // a loop later it moves on again
    vi.advanceTimersByTime(3 * 2400)
    expect(room.root).toBe('D')
    practice.stopPlayback()
  })
})

describe('drone and metronome', () => {
  it('starts and stops the drone on the selection tonic, following changes live', async () => {
    const { room, practice } = freshStores()
    room.practice = 'quiz'
    practice.toggleDrone()
    expect(practice.droneOn).toBe(true)
    // E selection → E3 (52) an octave down = 40
    expect(drone.start).toHaveBeenCalledWith(expect.anything(), 40, {
      voice: 'root',
      mode: 'sustain',
      level: 0.6,
    })
    room.root = 'A'
    await nextTick()
    expect(drone.update).toHaveBeenCalledWith(expect.anything(), 45, expect.anything())
    room.droneVoice = 'fifth'
    room.droneMode = 'pulse'
    room.droneLevel = 30
    await nextTick()
    expect(drone.update).toHaveBeenLastCalledWith(expect.anything(), 45, {
      voice: 'fifth',
      mode: 'pulse',
      level: 0.3,
    })
    practice.toggleDrone()
    expect(practice.droneOn).toBe(false)
    expect(drone.stop).toHaveBeenCalled()
  })

  it('runs the metronome with the shared settings and follows them live', async () => {
    const { room, practice } = freshStores()
    room.practice = 'patterns'
    practice.toggleMetronome()
    expect(metronome.start).toHaveBeenCalledWith(expect.anything(), {
      bpm: 100,
      meter: '4/4',
      subdivision: 1,
    })
    room.tempo = 160
    room.meter = '6/8'
    room.sub = 3
    await nextTick()
    expect(metronome.setOptions).toHaveBeenCalledWith({
      bpm: 160,
      meter: '6/8',
      subdivision: 3,
    })
  })

  it('mirrors the metronome beat for the visual pulse only while clicking', () => {
    const { practice } = freshStores()
    const fire = (metronome as unknown as { onBeat: (b: number) => void }).onBeat
    expect(practice.metronomeBeat).toBe(-1)
    // a beat announced after everything stopped must not revive the pulse
    fire(3)
    expect(practice.metronomeBeat).toBe(-1)
    practice.toggleMetronome() // on — the store wires itself into the callback
    fire(3)
    expect(practice.metronomeBeat).toBe(3)
    practice.toggleMetronome() // off again clears the pulse
    expect(practice.metronomeBeat).toBe(-1)
  })

  it('sets the tempo from a run of taps and resets after a long pause', () => {
    const { room, practice } = freshStores()
    practice.tapTempo(0)
    expect(room.tempo).toBe(100) // one tap says nothing yet
    practice.tapTempo(500)
    practice.tapTempo(1000)
    expect(room.tempo).toBe(120)
    // a long silence starts a new measurement
    practice.tapTempo(10000)
    expect(room.tempo).toBe(120)
    practice.tapTempo(10400)
    expect(room.tempo).toBe(150)
  })

  it('silences everything when the panel closes', async () => {
    const { room, practice } = freshStores()
    room.practice = 'quiz'
    await nextTick() // flush the open before the close, as real clicks would
    practice.toggleDrone()
    practice.toggleMetronome()
    room.practice = 'off'
    await nextTick()
    expect(practice.droneOn).toBe(false)
    expect(practice.metronomeOn).toBe(false)
    expect(drone.stop).toHaveBeenCalled()
    expect(metronome.stop).toHaveBeenCalled()
  })
})
