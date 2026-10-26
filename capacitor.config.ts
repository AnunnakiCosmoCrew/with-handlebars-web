import type { CapacitorConfig } from '@capacitor/cli'

// The iOS app is the web build in a WKWebView — see ADR-0003. `dist` is the same
// artifact Cloudflare Pages serves, so `npm run build` then `npx cap sync` is the
// whole packaging step.
const config: CapacitorConfig = {
  // Proposed in ADR-0003; the App Store Connect record that claims it is HB-55.
  appId: 'com.cosmocrew.withhandlebars',
  // Home-screen label only. Store listing copy is HB-58.
  appName: 'Handlebars',
  webDir: 'dist',
}

export default config
