/**
 * Practice-room audio: tempo math, a layered tonic drone (sustained or
 * tanpura-style pulsing), and a meter-aware metronome — WebAudio primitives
 * layered next to the sampled AudioEngine. No music theory here: callers
 * hand over concrete MIDI notes.
 */

export const TEMPO_MIN = 40
export const TEMPO_MAX = 240
export const TEMPO_DEFAULT = 100

export function clampTempo(bpm: number): number {
  if (!Number.isFinite(bpm)) return TEMPO_DEFAULT
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(bpm)))
}

/** Seconds per beat at a tempo. */
export function beatSeconds(bpm: number): number {
  return 60 / clampTempo(bpm)
}

export function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

// ---- meter ----

export type MeterId = '2/4' | '3/4' | '4/4' | '6/8'

/** Supported meters: beats per bar and which beats carry the accent. */
export const METERS: { id: MeterId; beats: number; accents: number[] }[] = [
  { id: '2/4', beats: 2, accents: [0] },
  { id: '3/4', beats: 3, accents: [0] },
  { id: '4/4', beats: 4, accents: [0] },
  // Compound: six quick beats felt in two — accents on both pulse heads.
  { id: '6/8', beats: 6, accents: [0, 3] },
]

export function meterOf(id: MeterId): { id: MeterId; beats: number; accents: number[] } {
  return METERS.find(m => m.id === id) ?? METERS[2]!
}

export const SUBDIVISIONS = [1, 2, 3, 4] as const
/** Clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths. */
export type Subdivision = (typeof SUBDIVISIONS)[number]

// ---- tap tempo ----

/** A pause longer than this between taps starts a fresh measurement. */
export const TAP_RESET_MS = 2000

/**
 * How far ahead of `currentTime` a run of clicks is scheduled — enough that
 * the first one is never booked in the past. It is part of the count-in's
 * length, so anything timed against a count-in has to account for it.
 */
export const SCHEDULE_LEAD = 0.05

/**
 * BPM from tap timestamps (ms, ascending): the average of the gaps between
 * the last few taps, clamped to the supported range. Null until there are
 * two taps, or when any gap is implausible for a tap streak.
 */
export function bpmFromTaps(taps: number[]): number | null {
  const recent = taps.slice(-6)
  if (recent.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < recent.length; i++) {
    const gap = recent[i]! - recent[i - 1]!
    if (gap <= 0 || gap > TAP_RESET_MS) return null
    gaps.push(gap)
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  return clampTempo(60000 / avg)
}

// ---- drone ----

export type DroneVoice = 'root' | 'fifth'
export type DroneMode = 'sustain' | 'pulse'
export type DroneOptions = {
  voice: DroneVoice
  mode: DroneMode
  /** 0–1 master level. */
  level: number
}

/** Seconds between tanpura plucks; deliberately free of the click tempo. */
const PULSE_SPACING = 0.85
const PULSE_DECAY = 3.2

function droneGain(level: number): number {
  return Math.max(0.0001, Math.min(1, level) * 0.28)
}

/**
 * The practice drone. Two characters share one lowpassed master bus:
 *
 * - `sustain`: a layered pedal tone — sub-octave sine under a detuned
 *   triangle pair on the tonic, with a soft fifth partial when asked —
 *   rather than a bare oscillator.
 * - `pulse`: a tanpura-style cycle of long overlapping plucks (fifth below,
 *   tonic, tonic, low tonic), each rung out over a few seconds.
 *
 * Gentle attack/release ramps everywhere so nothing ever clicks.
 */
export class Drone {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private sustained: OscillatorNode[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private pulseStep = 0
  private midi = 0
  private opts: DroneOptions = { voice: 'root', mode: 'sustain', level: 0.6 }

  get running(): boolean {
    return this.ctx !== null
  }

  start(ctx: AudioContext, midi: number, opts: DroneOptions): void {
    this.stop(ctx)
    this.ctx = ctx
    this.midi = midi
    this.opts = { ...opts }
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, ctx.currentTime)
    master.gain.exponentialRampToValueAtTime(droneGain(opts.level), ctx.currentTime + 0.3)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1500
    filter.Q.value = 0.5
    filter.connect(master)
    master.connect(ctx.destination)
    this.master = master
    this.filter = filter
    if (opts.mode === 'sustain') this.buildSustain()
    else {
      this.pulseStep = 0
      this.pulseLoop()
    }
  }

  /**
   * Follow a changed tonic or changed options while running. A new mode or
   * voicing rebuilds the graph; a new tonic glides the sustained layers (the
   * pulse simply picks it up on its next pluck); a new level ramps the bus.
   */
  update(ctx: AudioContext, midi: number, opts: DroneOptions): void {
    if (!this.running) return
    if (opts.mode !== this.opts.mode || opts.voice !== this.opts.voice) {
      this.start(ctx, midi, opts)
      return
    }
    if (opts.level !== this.opts.level && this.master) {
      this.master.gain.setTargetAtTime(droneGain(opts.level), ctx.currentTime, 0.1)
    }
    if (midi !== this.midi) {
      const glide = (osc: OscillatorNode, m: number) =>
        osc.frequency.setTargetAtTime(midiFrequency(m), ctx.currentTime, 0.05)
      const layers = this.sustainLayers(midi)
      this.sustained.forEach((osc, i) => {
        const layer = layers[i]
        if (layer) glide(osc, layer.midi + layer.detune)
      })
    }
    this.midi = midi
    this.opts = { ...opts }
  }

  stop(ctx?: AudioContext): void {
    clearTimeout(this.timer)
    this.timer = undefined
    const { master, sustained } = this
    this.ctx = null
    this.master = null
    this.filter = null
    this.sustained = []
    if (!master) return
    if (ctx) {
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08)
      for (const osc of sustained) osc.stop(ctx.currentTime + 0.6)
    } else {
      for (const osc of sustained) osc.stop()
    }
  }

  /** The sustained layers, in midi + fractional detune, quietest last. */
  private sustainLayers(midi: number): { midi: number; detune: number; gain: number; type: OscillatorType }[] {
    const layers: { midi: number; detune: number; gain: number; type: OscillatorType }[] = [
      { midi: midi - 12, detune: 0, gain: 0.55, type: 'sine' },
      { midi, detune: 0, gain: 0.5, type: 'triangle' },
      { midi, detune: 0.07, gain: 0.35, type: 'triangle' },
    ]
    if (this.opts.voice === 'fifth') layers.push({ midi: midi + 7, detune: 0.03, gain: 0.22, type: 'triangle' })
    return layers
  }

  private buildSustain(): void {
    const ctx = this.ctx
    if (!ctx || !this.filter) return
    for (const layer of this.sustainLayers(this.midi)) {
      const osc = ctx.createOscillator()
      osc.type = layer.type
      osc.frequency.value = midiFrequency(layer.midi + layer.detune)
      const gain = ctx.createGain()
      gain.gain.value = layer.gain
      osc.connect(gain).connect(this.filter)
      osc.start()
      this.sustained.push(osc)
    }
  }

  private pulseLoop(): void {
    const ctx = this.ctx
    if (!ctx || !this.filter) return
    // Pa–Sa–Sa–Sa(low): the fifth below leads when the voicing carries it.
    const cycle =
      this.opts.voice === 'fifth'
        ? [this.midi - 5, this.midi, this.midi, this.midi - 12]
        : [this.midi, this.midi, this.midi, this.midi - 12]
    const midi = cycle[this.pulseStep % cycle.length]!
    this.pulseStep++
    this.pluck(ctx, midi)
    this.timer = setTimeout(() => this.pulseLoop(), PULSE_SPACING * 1000)
  }

  private pluck(ctx: AudioContext, midi: number): void {
    if (!this.filter) return
    const at = ctx.currentTime
    for (const [detune, gain] of [
      [0, 0.55],
      [0.06, 0.4],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = midiFrequency(midi + detune)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, at)
      env.gain.exponentialRampToValueAtTime(gain, at + 0.02)
      env.gain.exponentialRampToValueAtTime(0.0001, at + PULSE_DECAY)
      osc.connect(env).connect(this.filter)
      osc.start(at)
      osc.stop(at + PULSE_DECAY + 0.1)
    }
  }
}

// ---- metronome ----

export type MetronomeOptions = {
  bpm: number
  meter: MeterId
  subdivision: Subdivision
}

const CLICKS = {
  accent: { freq: 1568, gain: 0.32 },
  beat: { freq: 1100, gain: 0.22 },
  sub: { freq: 1760, gain: 0.08 },
} as const

/**
 * A meter-aware metronome: accented downbeats (both pulse heads in 6/8),
 * optional softer subdivision clicks between beats, all scheduled a beat at
 * a time on the AudioContext clock so the pulse stays steady even when the
 * JS timer jitters.
 */
export class Metronome {
  /** Fired (via a timer aligned to the audio clock) as each beat sounds —
   * the hook for a visual pulse. Receives the 0-based beat within the bar. */
  onBeat: ((beatInBar: number) => void) | null = null

  private ctx: AudioContext | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private announceTimers = new Set<ReturnType<typeof setTimeout>>()
  private nextBeatAt = 0
  private beatIndex = 0
  private opts: MetronomeOptions = { bpm: TEMPO_DEFAULT, meter: '4/4', subdivision: 1 }

  get running(): boolean {
    return this.ctx !== null
  }

  start(ctx: AudioContext, opts: MetronomeOptions, startAt?: number): void {
    this.stop()
    this.ctx = ctx
    this.opts = { ...opts, bpm: clampTempo(opts.bpm) }
    this.beatIndex = 0
    this.nextBeatAt = startAt ?? ctx.currentTime + SCHEDULE_LEAD
    this.armTimer()
  }

  /** Tempo/meter/subdivision changes take hold on the next beat. */
  setOptions(opts: Partial<MetronomeOptions>): void {
    this.opts = {
      ...this.opts,
      ...opts,
      bpm: clampTempo(opts.bpm ?? this.opts.bpm),
    }
  }

  /**
   * One accented count-in bar starting now, whether or not the metronome is
   * running; a running metronome re-anchors so its own downbeat lands right
   * after the count-in. Returns the seconds until the bar ends — the small
   * scheduling lead-in before its first click included, so playback started
   * after this delay lands on the re-anchored downbeat, not 50ms early.
   */
  countIn(ctx: AudioContext, opts: MetronomeOptions): number {
    // A running metronome may have a beat announced but not yet sounded —
    // cancel it before this bar schedules its own, so the count-in owns the
    // visual pulse from its first click.
    for (const t of this.announceTimers) clearTimeout(t)
    this.announceTimers.clear()
    const meter = meterOf(opts.meter)
    const beat = beatSeconds(opts.bpm)
    const start = ctx.currentTime + SCHEDULE_LEAD
    for (let i = 0; i < meter.beats; i++) {
      this.click(ctx, start + i * beat, meter.accents.includes(i) ? 'accent' : 'beat')
      this.announceBeat(ctx, start + i * beat, i)
    }
    const bar = meter.beats * beat
    if (this.running && this.ctx === ctx) {
      clearTimeout(this.timer)
      this.opts = { ...this.opts, ...opts, bpm: clampTempo(opts.bpm) }
      this.beatIndex = 0
      this.nextBeatAt = start + bar
      this.armTimer()
    }
    return start + bar - ctx.currentTime
  }

  stop(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    for (const t of this.announceTimers) clearTimeout(t)
    this.announceTimers.clear()
    this.ctx = null
  }

  private armTimer(): void {
    const ctx = this.ctx
    if (!ctx) return
    const waitMs = Math.max(10, (this.nextBeatAt - ctx.currentTime) * 1000 - 40)
    this.timer = setTimeout(() => this.tick(), waitMs)
  }

  private tick(): void {
    const ctx = this.ctx
    if (!ctx) return
    const meter = meterOf(this.opts.meter)
    const beat = beatSeconds(this.opts.bpm)
    // A throttled background tab can leave the schedule in the past — skip
    // the missed beats rather than machine-gunning catch-up clicks.
    while (this.nextBeatAt < ctx.currentTime) {
      this.nextBeatAt += beat
      this.beatIndex++
    }
    const inBar = this.beatIndex % meter.beats
    this.click(ctx, this.nextBeatAt, meter.accents.includes(inBar) ? 'accent' : 'beat')
    this.announceBeat(ctx, this.nextBeatAt, inBar)
    for (let s = 1; s < this.opts.subdivision; s++) {
      this.click(ctx, this.nextBeatAt + (s * beat) / this.opts.subdivision, 'sub')
    }
    this.beatIndex++
    this.nextBeatAt += beat
    this.armTimer()
  }

  private announceBeat(ctx: AudioContext, at: number, beatInBar: number): void {
    const cb = this.onBeat
    if (!cb) return
    // Tracked so stop() can cancel beats already announced but not yet
    // sounded — otherwise a late callback would revive the visual pulse.
    const timer = setTimeout(() => {
      this.announceTimers.delete(timer)
      cb(beatInBar)
    }, Math.max(0, (at - ctx.currentTime) * 1000))
    this.announceTimers.add(timer)
  }

  private click(ctx: AudioContext, at: number, kind: keyof typeof CLICKS): void {
    const { freq, gain } = CLICKS[kind]
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const env = ctx.createGain()
    env.gain.setValueAtTime(gain, at)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    osc.connect(env).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + 0.06)
  }
}

export const drone = new Drone()
export const metronome = new Metronome()
