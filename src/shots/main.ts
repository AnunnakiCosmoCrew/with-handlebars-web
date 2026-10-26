import '../style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { clearRoomState, nativeStub, reportPointerType, seedRandom } from './harness.js'
import App from '../App.vue'

// Order matters, and only in one direction: every call below has to happen
// before mount(), because that is when App.vue's setup() reads the platform
// and when the store first reads localStorage. Where they sit relative to the
// imports does not matter — see harness.ts's nativeStub() for why the usual
// hoisting worry does not apply here.
nativeStub()
clearRoomState()
seedRandom()
reportPointerType()

createApp(App).use(createPinia()).mount('#app')

