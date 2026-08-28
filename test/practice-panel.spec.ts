import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from '../src/stores/room.js'
import { usePracticeStore } from '../src/stores/practice.js'
import PracticePanel from '../src/components/PracticePanel.vue'

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

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

describe('PracticePanel', () => {
  it('shows the three mode tabs and nothing else while closed', () => {
    useRoomStore()
    const w = mount(PracticePanel)
    expect(w.findAll('[data-practice-tab]')).toHaveLength(3)
    expect(w.find('[data-drone]').exists()).toBe(false)
    expect(w.find('[data-metronome]').exists()).toBe(false)
  })

  it('opens a tab, quizzing immediately, and closes on a second click', async () => {
    const store = useRoomStore()
    const practice = usePracticeStore()
    const w = mount(PracticePanel)
    await w.find('[data-practice-tab="quiz"]').trigger('click')
    expect(store.practice).toBe('quiz')
    expect(practice.question).not.toBe(null)
    expect(w.find('[data-quiz-prompt]').exists()).toBe(true)
    expect(w.find('[data-quiz-score]').text()).toBe('0/0')
    expect(w.find('[data-drone]').exists()).toBe(true)
    await w.find('[data-practice-tab="quiz"]').trigger('click')
    expect(store.practice).toBe('off')
  })

  it('offers the seven patterns and starts playback', async () => {
    const store = useRoomStore()
    const practice = usePracticeStore()
    const w = mount(PracticePanel)
    await w.find('[data-practice-tab="patterns"]').trigger('click')
    expect(w.findAll('[data-pattern]')).toHaveLength(7)
    await w.find('[data-pattern="thirds"]').trigger('click')
    expect(store.pattern).toBe('thirds')
    await w.find('[data-pattern-play]').trigger('click')
    expect(practice.playing).toBe('pattern')
    await w.find('[data-pattern-play]').trigger('click')
    expect(practice.playing).toBe('off')
    practice.stopPlayback()
  })

  it('names the run source in both modes: a chip in chord mode, a switch in scale mode', async () => {
    const store = useRoomStore()
    const w = mount(PracticePanel)
    await w.find('[data-practice-tab="patterns"]').trigger('click')
    // chord mode: the arpeggio is a statement, not a choice
    expect(w.find('span[data-run-source="arpeggio"]').exists()).toBe(true)
    expect(w.find('button[data-run-source]').exists()).toBe(false)
    store.mode = 'scale'
    await w.vm.$nextTick()
    expect(w.find('button[data-run-source="scale"]').exists()).toBe(true)
    expect(w.find('button[data-run-source="arpeggio"]').exists()).toBe(true)
    expect(w.find('span[data-run-source]').exists()).toBe(false)
  })

  it('explains progression practice needs a 7-note scale', async () => {
    const store = useRoomStore()
    const w = mount(PracticePanel)
    await w.find('[data-practice-tab="progression"]').trigger('click')
    // default chord mode: not harmonizable
    expect(w.find('[data-prog-unavailable]').exists()).toBe(true)
    store.mode = 'scale'
    await w.vm.$nextTick()
    expect(w.find('[data-prog-unavailable]').exists()).toBe(false)
    expect(w.findAll('[data-prog-bar]')).toHaveLength(3) // I–IV–V
    store.scaleId = 'pentatonic-major'
    await w.vm.$nextTick()
    expect(w.find('[data-prog-unavailable]').exists()).toBe(true)
  })

  it('toggles the progression voicing between smooth and root position', async () => {
    const store = useRoomStore()
    store.mode = 'scale'
    const w = mount(PracticePanel)
    await w.find('[data-practice-tab="progression"]').trigger('click')
    const btn = w.find('[data-voicing]')
    expect(btn.attributes('aria-pressed')).toBe('true') // smooth is the default
    await btn.trigger('click')
    expect(store.voicing).toBe('root')
    expect(btn.attributes('aria-pressed')).toBe('false')
    await btn.trigger('click')
    expect(store.voicing).toBe('smooth')
  })

  it('drives the shared tempo from the slider', async () => {
    const store = useRoomStore()
    const w = mount(PracticePanel)
    await w.find('[data-practice-tab="patterns"]').trigger('click')
    const slider = w.find('input[type="range"]')
    await slider.setValue('160')
    expect(store.tempo).toBe(160)
    expect(w.text()).toContain('160 BPM')
  })

  it('offers meter, subdivision, tap tempo, and drone settings while open', async () => {
    const store = useRoomStore()
    const w = mount(PracticePanel)
    expect(w.find('[data-meter]').exists()).toBe(false) // closed panel: no settings
    await w.find('[data-practice-tab="patterns"]').trigger('click')
    expect(w.findAll('[data-meter]')).toHaveLength(4)
    expect(w.findAll('[data-sub]')).toHaveLength(4)
    await w.find('[data-meter="3/4"]').trigger('click')
    expect(store.meter).toBe('3/4')
    await w.find('[data-sub="3"]').trigger('click')
    expect(store.sub).toBe(3)
    await w.find('[data-drone-mode]').trigger('click')
    expect(store.droneMode).toBe('pulse')
    await w.find('[data-drone-voice]').trigger('click')
    expect(store.droneVoice).toBe('fifth')
    await w.find('[data-drone-level]').setValue('25')
    expect(store.droneLevel).toBe(25)
    expect(w.find('[data-tap-tempo]').exists()).toBe(true)
  })

  it('shows one beat dot per beat of the meter, pulsing with the click', async () => {
    const store = useRoomStore()
    const practice = usePracticeStore()
    const w = mount(PracticePanel)
    await w.find('[data-practice-tab="patterns"]').trigger('click')
    expect(w.findAll('.beat-dot')).toHaveLength(4)
    store.meter = '6/8'
    await w.vm.$nextTick()
    expect(w.findAll('.beat-dot')).toHaveLength(6)
    // nothing lights while the click is off…
    practice.metronomeBeat = 2
    await w.vm.$nextTick()
    expect(w.find('.beat-dot-active').exists()).toBe(false)
    // …and the sounding beat lights while it runs
    await w.find('[data-metronome]').trigger('click')
    practice.metronomeBeat = 2
    await w.vm.$nextTick()
    expect(w.find('[data-beat-dot="2"]').classes()).toContain('beat-dot-active')
  })

  it('sets the tempo from tap-tempo clicks', async () => {
    const store = useRoomStore()
    const practice = usePracticeStore()
    mount(PracticePanel)
    practice.tapTempo(0)
    practice.tapTempo(400)
    practice.tapTempo(800)
    expect(store.tempo).toBe(150)
  })
})
