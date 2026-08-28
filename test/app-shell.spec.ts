import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../src/App.vue'
import { useRoomStore } from '../src/stores/room.js'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

const mountApp = () => mount(App, { global: { plugins: [createPinia()] } })

describe('app shell', () => {
  it('renders brand, controls, board, playback, info, and footer', () => {
    const w = mountApp()
    expect(w.get('h1').text()).toBe('With Handlebars')
    expect(w.get('.brand-tag').text()).toContain('guitar')
    expect(w.find('.brand-mark').exists()).toBe(true)
    expect(w.find('[role=radiogroup]').exists()).toBe(true)
    expect(w.find('.fretboard').exists()).toBe(true)
    expect(w.find('.play-button').exists()).toBe(true)
    expect(w.find('.info').exists()).toBe(true)
    expect(w.get('.site-footer').text()).toContain('midi-js-soundfonts')
  })

  it('points the footer at the about page, the crew, and the mailbox', () => {
    const w = mountApp()
    const hrefs = w.get('.site-footer').findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('/about')
    expect(hrefs).toContain('https://cosmocrew.dev/')
    expect(hrefs).toContain('https://ko-fi.com/cosmocrew')
    expect(hrefs).toContain('mailto:contact@cosmocrew.dev')
  })

  it('wraps the board in a horizontal scroller for small screens', () => {
    const w = mountApp()
    expect(w.get('.board-scroll').find('.fretboard').exists()).toBe(true)
  })

  it('shows the position picker always, the overlay picker only in scale mode', async () => {
    const w = mountApp()
    expect(w.find('.position-picker').exists()).toBe(true)
    expect(w.find('.neck-lenses').exists()).toBe(true)
    expect(w.find('.overlay-picker').exists()).toBe(false)
    history.replaceState(null, '', '/?scale=major')
    const scaled = mountApp()
    expect(scaled.find('.overlay-picker').exists()).toBe(true)
  })

  it('collapses the notation, circle, practice, details, and anatomy cards', async () => {
    const w = mountApp()
    const heads = w.findAll('.ccard-head').map(h => h.text())
    expect(heads).toEqual(['Notation', 'Circle of fifths', 'Practice', 'Details', "How it's built"])
    expect(w.find('.anatomy').exists()).toBe(true)
    await w.find('[data-card="How it\'s built"]').trigger('click')
    expect(w.find('.anatomy').exists()).toBe(false)
    await w.find('[data-card="Details"]').trigger('click')
    expect(w.find('.info').exists()).toBe(false)
    await w.find('[data-card="Notation"]').trigger('click')
    expect(w.find('.staff-scroll').exists()).toBe(false)
    expect(w.find('.practice').exists()).toBe(true)
    await w.find('[data-card="Practice"]').trigger('click')
    expect(w.find('.practice').exists()).toBe(false)
  })

  it('closes practice outright when its card is folded, silencing playback', async () => {
    history.replaceState(null, '', '/?practice=patterns')
    const w = mountApp()
    const store = useRoomStore()
    expect(store.practice).toBe('patterns')
    await w.find('[data-card="Practice"]').trigger('click')
    expect(store.practiceCard).toBe('hide')
    expect(store.practice).toBe('off')
  })
})
