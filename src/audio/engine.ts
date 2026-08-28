import { Soundfont } from 'smplr'
import type { PlaybackNotes } from '@anunnakicosmocrew/handlebars'

export type InstrumentId = 'nylon' | 'steel' | 'electric-clean' | 'electric-jazz'

/** The four observed instruments, mapped to General MIDI soundfont names. */
export const INSTRUMENTS: { id: InstrumentId; name: string; soundfont: string }[] = [
  { id: 'nylon', name: 'Nylon Guitar', soundfont: 'acoustic_guitar_nylon' },
  { id: 'steel', name: 'Steel Guitar', soundfont: 'acoustic_guitar_steel' },
  { id: 'electric-clean', name: 'Electric Guitar (Clean)', soundfont: 'electric_guitar_clean' },
  { id: 'electric-jazz', name: 'Electric Guitar (Jazz)', soundfont: 'electric_guitar_jazz' },
]

/**
 * Self-hosted sample URL for an instrument (see public/soundfonts/README.md) —
 * playback makes no external network requests at runtime.
 */
export function soundfontUrl(soundfont: string): string {
  return `${import.meta.env.BASE_URL}soundfonts/${soundfont}-ogg.js`
}

export const SPEED_MIN = 0
export const SPEED_MAX = 4
export const SPEED_DEFAULT = 2

/** Seconds between strummed notes, one per speed step (snail → rabbit). */
const STRUM_STAGGER = [0.14, 0.1, 0.065, 0.04, 0.025] as const
/** Seconds per note in a scale run, one per speed step. */
const SEQUENCE_STEP = [0.6, 0.45, 0.32, 0.22, 0.15] as const
const STRUM_SUSTAIN = 2.5

export type ScheduledNote = { note: number; at: number; duration: number }

/** Pure timing math for a playback: offsets in seconds from "now". */
export function noteSchedule(playback: PlaybackNotes, speed: number): ScheduledNote[] {
  const s = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(speed)))
  if (playback.kind === 'strum') {
    const stagger = STRUM_STAGGER[s]!
    return playback.midi.map((note, i) => ({
      note,
      at: i * stagger,
      duration: STRUM_SUSTAIN,
    }))
  }
  const step = SEQUENCE_STEP[s]!
  return playback.midi.map((note, i) => ({ note, at: i * step, duration: step * 0.95 }))
}

/**
 * Thin wrapper around smplr's Soundfont player. The AudioContext is created
 * lazily on the first play() so it always starts from a user gesture.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private player: Soundfont | null = null
  private loadedInstrument: InstrumentId | null = null

  /** The shared AudioContext, created lazily (call from a user gesture). */
  ensureContext(): AudioContext {
    this.ctx ??= new AudioContext()
    // Some browsers hand out a suspended context even inside a gesture;
    // kick the resume so drone/metronome callers aren't left silent.
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  async ensureInstrument(id: InstrumentId): Promise<Soundfont> {
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') await ctx.resume()
    if (this.player && this.loadedInstrument === id) return this.player
    this.player?.stop()
    const spec = INSTRUMENTS.find(i => i.id === id)
    if (!spec) throw new Error(`unknown instrument: ${id}`)
    const player = Soundfont(ctx, {
      instrument: spec.soundfont,
      instrumentUrl: soundfontUrl(spec.soundfont),
    })
    await player.load
    this.player = player
    this.loadedInstrument = id
    return player
  }

  async play(playback: PlaybackNotes, instrument: InstrumentId, speed: number): Promise<number> {
    const player = await this.ensureInstrument(instrument)
    player.stop()
    const schedule = noteSchedule(playback, speed)
    const now = this.ctx!.currentTime
    for (const n of schedule) {
      player.start({ note: n.note, time: now + n.at, duration: n.duration })
    }
    const last = schedule[schedule.length - 1]
    return last ? last.at + last.duration : 0
  }

  /** Start one note now without cutting anything already sounding. */
  async playNote(midi: number, instrument: InstrumentId, duration: number): Promise<void> {
    const player = await this.ensureInstrument(instrument)
    player.start({ note: midi, duration })
  }

  /**
   * Sound one bar of a chord now, cutting the previous bar: held as a block,
   * lightly strummed on every beat, or rolled as a one-note-per-beat
   * arpeggio cycling the chord tones.
   */
  async playBar(
    midis: number[],
    instrument: InstrumentId,
    feel: BarFeel,
    beats: number,
    beatSec: number,
  ): Promise<void> {
    const player = await this.ensureInstrument(instrument)
    player.stop()
    if (midis.length === 0) return // a rest: cut the last bar, schedule nothing
    const now = this.ctx!.currentTime
    if (feel === 'block') {
      midis.forEach((note, i) => {
        player.start({ note, time: now + i * 0.02, duration: beats * beatSec * 0.95 })
      })
    } else if (feel === 'strum') {
      for (let b = 0; b < beats; b++) {
        midis.forEach((note, i) => {
          player.start({ note, time: now + b * beatSec + i * 0.015, duration: beatSec * 0.9 })
        })
      }
    } else {
      for (let b = 0; b < beats; b++) {
        player.start({
          note: midis[b % midis.length]!,
          time: now + b * beatSec,
          duration: beatSec * 0.95,
        })
      }
    }
  }

  stop(): void {
    this.player?.stop()
  }
}

export type BarFeel = 'block' | 'strum' | 'arpeggio'

export const audioEngine = new AudioEngine()
