import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../src/App.vue'
import { useRoomStore } from '../src/stores/room.js'
import { usePracticeStore } from '../src/stores/practice.js'

// The Safari sheet's plugin is native-only and imported lazily (ADR-0005).
vi.mock('@capacitor/browser', () => ({ Browser: { open: () => Promise.resolve() } }))

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

// One test rigs Math.random for a known first question; nothing else may
// inherit it.
afterEach(() => {
  vi.restoreAllMocks()
})

const mountApp = () => mount(App, { global: { plugins: [createPinia()] } })

/** The bar's own copy of the question, never the practice card's. */
const inBar = (w: ReturnType<typeof mountApp>, sel: string) => w.find(`[data-quiz-bar] ${sel}`)

describe('quiz bar', () => {
  it('stays away until a question is open', async () => {
    const w = mountApp()
    expect(w.find('[data-quiz-bar]').exists()).toBe(false)
    const store = useRoomStore()
    store.practice = 'quiz'
    usePracticeStore().startQuiz('note')
    await w.vm.$nextTick()
    expect(w.find('[data-quiz-bar]').exists()).toBe(true)
  })

  it('sits between the board and the rest of the room', async () => {
    const w = mountApp()
    useRoomStore().practice = 'quiz'
    usePracticeStore().startQuiz('note')
    await w.vm.$nextTick()
    const room = [...w.get('.room').element.children]
    expect(room.findIndex(el => el.hasAttribute('data-quiz-bar'))).toBe(
      room.findIndex(el => el.classList.contains('board-scroll')) + 1,
    )
  })

  it('carries the question, the score and the way onward', async () => {
    const w = mountApp()
    vi.spyOn(Math, 'random').mockReturnValue(0) // first root: C
    useRoomStore().practice = 'quiz'
    const practice = usePracticeStore()
    practice.startQuiz('note')
    await w.vm.$nextTick()
    expect(inBar(w, '[data-quiz-prompt]').text()).toContain('Tap any C on the neck')
    expect(inBar(w, '[data-quiz-bar-score]').text()).toBe('0/0')
    const asked = practice.question
    await inBar(w, '[data-quiz-skip]').trigger('click')
    expect(practice.question).not.toBe(asked)
    expect(practice.score).toEqual({ right: 0, asked: 0 }) // a skip is not a miss
  })

  it('is the one the screen reader follows — the card copy stays silent', async () => {
    const w = mountApp()
    const store = useRoomStore()
    store.practiceCard = 'show'
    store.practice = 'quiz'
    usePracticeStore().startQuiz('note')
    await w.vm.$nextTick()
    // both surfaces show the question; only one may announce it
    expect(w.findAll('[data-quiz-prompt]')).toHaveLength(2)
    expect(inBar(w, '[data-quiz-prompt]').attributes('aria-live')).toBe('polite')
    expect(
      w.get('[data-quiz-context="card"] [data-quiz-prompt]').attributes('aria-live'),
    ).toBeUndefined()
  })

  it('answers name-that-dot from the bar, so the board is never left', async () => {
    const w = mountApp()
    useRoomStore().practice = 'quiz'
    const practice = usePracticeStore()
    practice.startQuiz('dot')
    await w.vm.$nextTick()
    const q = practice.question!
    if (q.kind !== 'dot') throw new Error('unexpected kind')
    expect(w.findAll('[data-quiz-bar] [data-quiz-choice]')).toHaveLength(q.choices.length)
    await inBar(w, `[data-quiz-choice="${q.answer}"]`).trigger('click')
    expect(practice.feedback).toBe('right')
    expect(inBar(w, '[data-quiz-bar-score]').text()).toBe('1/1')
  })
})
