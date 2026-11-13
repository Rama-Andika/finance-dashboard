import { APP_VERSION } from './app-version'
import { createVersionStore } from './version-watch'

/** The one store of this browser tab. It also exists on the server, where nothing ever reports to it. */
export const appVersionStore = createVersionStore(APP_VERSION)
