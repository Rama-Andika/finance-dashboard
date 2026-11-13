import { CLIENT_ID_PATTERN } from '../lib/env-rules.mjs'
import { releaseName } from '../lib/release-layout.mjs'
import { versionProblems } from './package-rules.mjs'

/**
 * @typedef {{ ok: boolean, file: string, name: string, version: string, clientId: string }} PackageResult
 * @typedef {{ skipBuild?: boolean, localOnly?: boolean }} PackageOptions
 * @typedef {{
 *   now: () => Date,
 *   log: (line: string) => void,
 *   git: { describe: () => string, isDirty: () => boolean },
 *   build: (clientId: string) => boolean,
 *   readBuildInfo: () => { version?: string, clientId?: string } | null,
 *   scanBundle: () => { problems: string[], files: number },
 *   makePackage: (name: string) => { file: string, helper: string, sizeBytes: number },
 * }} PackageDeps
 */

/** A failure with a message for the person. */
class PackageError extends Error {}

/**
 * Builds the application for one client and environment, checks the build, and makes the package to upload to the server.
 * @param {{ client: string, env: string, options?: PackageOptions, deps: PackageDeps }} input
 * @returns {PackageResult}
 */
export function runPackage({ client, env, options = {}, deps }) {
  const { log, now } = deps
  let step = 0
  /** @param {string} text */
  const heading = (text) => log(`\n[${++step}] ${text}`)
  /** @type {PackageResult} */
  const result = { ok: false, file: '', name: '', version: '', clientId: '' }

  try {
    heading('Check the request and the version')
    if (!CLIENT_ID_PATTERN.test(client)) {
      throw new PackageError(
        'the client must be lowercase letters, digits and dashes (at most 64 characters), for example acme',
      )
    }
    if (env !== 'staging' && env !== 'production')
      throw new PackageError('the environment must be staging or production')
    // Staging has its own address prefix, so a staging package never fits a production deployment.
    const clientId = env === 'staging' ? `${client}-staging` : client
    const buildVersion = deps.git.describe()
    const problems = versionProblems({
      env,
      buildVersion,
      treeDirty: deps.git.isDirty(),
      localOnly: options.localOnly === true,
    })
    if (problems.length > 0) throw new PackageError(`this version cannot be packaged:\n  - ${problems.join('\n  - ')}`)
    const name = releaseName(buildVersion, now())
    result.name = name
    result.version = buildVersion
    result.clientId = clientId
    log(`  ${client} (${env}), CLIENT_ID ${clientId}, version ${buildVersion}`)

    heading('Build')
    if (options.skipBuild) {
      log('  skipped (--skip-build): the existing dist/ is used')
    } else {
      log(`  building for CLIENT_ID=${clientId} ...`)
      if (!deps.build(clientId)) throw new PackageError('the build failed')
    }

    heading('Check the build')
    const info = deps.readBuildInfo()
    if (!info) throw new PackageError('dist/build-info.json is missing or unreadable; build first')
    if (info.clientId !== clientId) {
      throw new PackageError(
        `the build in dist/ was made for CLIENT_ID "${info.clientId ?? ''}" but this package needs "${clientId}"; build again without --skip-build`,
      )
    }
    if (info.version !== buildVersion) {
      throw new PackageError(
        `the build says version "${info.version ?? ''}" but git says "${buildVersion}". Either the build changed a tracked file (look at git status) or dist/ comes from another commit. Fix that and build again.`,
      )
    }
    const scan = deps.scanBundle()
    if (scan.problems.length > 0)
      throw new PackageError(`the build would not run on the server:\n  - ${scan.problems.join('\n  - ')}`)
    log(`  ok: version ${info.version}, ${scan.files} files checked`)

    heading('Make the package')
    const made = deps.makePackage(name)
    result.file = made.file
    result.ok = true

    log(
      `\nPACKAGE READY: ${made.file} (${(made.sizeBytes / (1024 * 1024)).toFixed(1)} MB), for ${client} (${env}), version ${buildVersion}`,
    )
    if (options.localOnly) {
      log('\nLOCAL ONLY: this package is for trying things out on this computer. Its version is not a release tag,')
      log(
        'so the installer on a server refuses it. To deploy, make a release (docs/release-deploy-guide.html#konsep) and pack that tag.',
      )
    } else {
      log('\nNext, by hand:')
      log('  1. Upload the package to the server, any folder you like (WinSCP, scp, ...).')
      log(`     The first time for this deployment, also upload ${made.helper}`)
      log(`     into its deploy folder, which is named oxy-${client}-${env}-finance-dashboard-<port>.`)
      log('  2. On the server, run (replace <deploy folder> and <upload folder> with your own paths):')
      log(`       node <deploy folder>/open-package.mjs <upload folder>/${name}.tgz`)
      log(
        '  It opens the package and installs it. Do not rename the package file: its name is the name of the release.',
      )
      log(
        '  The first install of this deployment: add --prepare-only to that command (docs/release-deploy-guide.html#pertama).',
      )
    }
  } catch (error) {
    if (!(error instanceof PackageError)) throw error
    log(`\nFAILED: ${error.message}`)
  }
  return result
}
