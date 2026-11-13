import { createStart, type CustomFetch } from '@tanstack/react-start'
import { appVersionStore } from '~/lib/app-version/store'
import { withVersionReport } from '~/lib/app-version/version-watch'

/**
 * Every server function call the browser makes goes through this fetch. It hands the X-App-Version header of each response
 * to the version store, which tells the page when the server runs another version (VersionBanner). Server-side rendering
 * calls server functions directly and never uses it.
 */
const versionReportingFetch: CustomFetch = withVersionReport(
  (input, init) => fetch(input, init),
  (serverVersion) => appVersionStore.report(serverVersion),
)

export const startInstance = createStart(() => ({
  serverFns: { fetch: versionReportingFetch },
}))
