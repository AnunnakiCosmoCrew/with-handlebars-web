import '../style.css'
import { createApp } from 'vue'
import IconSheet from './IconSheet.vue'

// The manifest's maskable icon is the same plate with a smaller mark, so the
// renderer asks for it with a query flag — `icon.html?mark=512` — the way the
// social card takes a room query. Anything unparseable falls back to the
// component's own default rather than rendering a plate with no mark on it.
const mark = Number(new URLSearchParams(location.search).get('mark'))

createApp(IconSheet, mark > 0 ? { markSize: mark } : {}).mount('#icon')
