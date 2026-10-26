import './style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { listenForBoardLinks } from './lib/universal-links.js'
import { registerServiceWorker } from './lib/service-worker.js'
import { redirectFirstIPhoneVisit } from './lib/app-store.js'

// Before the app mounts: the room store reflects its state into the URL as it
// starts, and the redirect has to see the URL the visitor arrived with (HB-147).
// The app still mounts, so Safari's Back button returns to a working room.
redirectFirstIPhoneVisit()

createApp(App).use(createPinia()).mount('#app')
void listenForBoardLinks()
registerServiceWorker()
