import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestReview = vi.fn(async () => {})

vi.mock('@capacitor-community/in-app-review', () => ({
  InAppReview: { requestReview: () => requestReview() },
}))

const stubNativeShell = () => {
  Object.assign(window, {
    Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  })
}

async function load() {
  vi.resetModules()
  return import('../src/lib/app-review.js')
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  delete (window as { Capacitor?: unknown }).Capacitor
})

describe('asking for an App Store rating', () => {
  it('requests on the 4th qualifying session, and only then', async () => {
    stubNativeShell()
    const { quizSessionEnded } = await load()
    expect([1, 2, 3].map(() => quizSessionEnded(10))).toEqual([false, false, false])
    await settled()
    expect(requestReview).not.toHaveBeenCalled()
    expect(quizSessionEnded(10)).toBe(true)
    await settled()
    expect(requestReview).toHaveBeenCalledTimes(1)
  })

  it('asks once per install', async () => {
    stubNativeShell()
    const { quizSessionEnded } = await load()
    for (let i = 0; i < 4; i++) quizSessionEnded(12)
    expect(quizSessionEnded(12)).toBe(false)
    expect(quizSessionEnded(12)).toBe(false)
    await settled()
    expect(requestReview).toHaveBeenCalledTimes(1)
  })

  it('does not count a session under 10 answers', async () => {
    stubNativeShell()
    const { quizSessionEnded, SESSIONS_KEY } = await load()
    for (let i = 0; i < 6; i++) expect(quizSessionEnded(9)).toBe(false)
    expect(localStorage.getItem(SESSIONS_KEY)).toBeNull()
    await settled()
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('remembers sessions across reloads', async () => {
    stubNativeShell()
    for (let i = 0; i < 3; i++) (await load()).quizSessionEnded(10)
    expect((await load()).quizSessionEnded(10)).toBe(true)
  })

  it('does nothing on the website', async () => {
    const { quizSessionEnded, SESSIONS_KEY } = await load()
    for (let i = 0; i < 6; i++) expect(quizSessionEnded(20)).toBe(false)
    expect(localStorage.getItem(SESSIONS_KEY)).toBeNull()
    await settled()
    expect(requestReview).not.toHaveBeenCalled()
  })
})
