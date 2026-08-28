import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  // No client-side routing to fall back for, and with more than one page the
  // SPA fallback would answer /about with the room. Matches how Pages serves
  // the built files.
  appType: 'mpa',
  build: {
    // Static pages that sit beside the app are their own entries rather than
    // routes: the room is the only thing that needs a running Vue app, and a
    // page of prose shouldn't ship one. Add an entry per page.
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        about: resolve(here, 'about.html'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
  },
})
