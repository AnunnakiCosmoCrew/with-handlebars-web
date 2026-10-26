import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { serviceWorkerPlugin } from './tools/service-worker-plugin'
import { boardPagesPlugin } from './tools/board-pages-plugin'
import { ogCardsPlugin } from './tools/og-cards-plugin'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  // sw.js is generated from service-worker/sw.js once the bundle's file names exist (ADR-0008).
  // The board pages and sitemap.xml are generated from the built index.html (HB-153).
  // Each board page's social cards are photographed after the build, with HB_OG_CARDS=1 (HB-155).
  plugins: [vue(), boardPagesPlugin(here), serviceWorkerPlugin(here), ogCardsPlugin(here)],
  // No client-side routing to fall back for, and with more than one page the
  // SPA fallback would answer /about with the room. Matches how Pages serves
  // the built files.
  appType: 'mpa',
  build: {
    // Static pages that sit beside the app are their own entries rather than
    // routes: the room is the only thing that needs a running Vue app, and a
    // page of prose shouldn't ship one. Add an entry per page.
    // The render pages — og.html, icon.html, splash.html, shots.html — are
    // deliberately not here; they are dev-only sources for generated assets.
    // test/build-inputs.spec.ts is what keeps that true.
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        about: resolve(here, 'about.html'),
        privacy: resolve(here, 'privacy.html'),
        // Pages serves it, with a 404, for any path it has no file for (HB-151).
        notFound: resolve(here, '404.html'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    // See the file for why: Node 25's built-in Web Storage stub shadows
    // happy-dom's `localStorage`, and this puts happy-dom's back.
    setupFiles: [resolve(here, 'test/setup-web-storage.ts')],
  },
})
