import { basename, dirname } from 'node:path'
import { ENV_FILE_NAME, healthUrl, parseDeployFolder, RELEASE_NAME_PATTERN } from './release-layout.mjs'
import { installVersionProblem } from './version-rules.mjs'

/** How many releases stay on the server after an install (plus the current and the previous one). */
export const DEFAULT_KEEP = 5
const HEALTH_TIMEOUT_SECONDS = 120
const HEALTH_STABLE_SECONDS = 10
const MINUTE_MS = 60 * 1000

/**
 * @typedef {'installed' | 'rolled-back' | 'rollback-failed' | 'failed' | 'prepared' | 'dry-run'} InstallStatus
 * @typedef {{ ok: boolean, status: InstallStatus, release: string, version: string }} InstallResult
 * @typedef {{ code: number, stdout: string, stderr: string }} RunResult
 * @typedef {{ root: string, name: string, releaseDir: string, folder: NonNullable<ReturnType<typeof parseDeployFolder>> }} Place
 * @typedef {{ dryRun?: boolean, prepareOnly?: boolean, keep?: number }} InstallOptions
 * @typedef {{
 *   now: () => Date,
 *   log: (line: string) => void,
 *   run: (argv: string[], options?: { cwd?: string, timeoutMs?: number }) => RunResult,
 *   exists: (path: string) => boolean,
 *   makeLock: (path: string) => boolean,
 *   removeLock: (path: string) => void,
 *   readBuildInfo: (releaseDir: string) => { version?: string, clientId?: string } | null,
 *   refreshOpener: (releaseDir: string, root: string) => 'added' | 'updated' | 'same' | 'no-source',
 *   nodePath: string,
 *   npmPath: string,
 * }} InstallDeps
 */

/** A failure with a message for the person. `status` says what state the server is left in. */
class InstallError extends Error {
  /** @param {string} message @param {InstallStatus} [status] */
  constructor(message, status = 'failed') {
    super(message)
    this.status = status
  }
}

/**
 * Where a release folder sits: <deploy folder>/releases/<release name>, with the deploy folder named
 * oxy-<client>-<env>-finance-dashboard-<port>. Nothing is read from disk.
 * @param {string} releaseDir the folder of one release (the folder above scripts/)
 * @returns {{ place: Place | null, message: string }} place is null, and message says why, when the folder is not where a release belongs
 */
export function locateRelease(releaseDir) {
  const name = basename(releaseDir)
  const releases = dirname(releaseDir)
  const root = dirname(releases)
  if (!RELEASE_NAME_PATTERN.test(name) || basename(releases) !== 'releases') {
    return {
      place: null,
      message:
        'this script must run from a release folder: <deploy folder>/releases/<time>-<version>/scripts/ops/. Open the package with open-package.mjs first.',
    }
  }
  const folder = parseDeployFolder(basename(root))
  if (!folder) {
    return {
      place: null,
      message: `the deploy folder "${basename(root)}" must be named oxy-<client>-<env>-finance-dashboard-<port>`,
    }
  }
  return { place: { root, name, releaseDir, folder }, message: '' }
}

/** A script of scripts/ops run with the Node that runs this one. @param {string} node @param {string} tool @param {string[]} args */
function toolArgv(node, tool, args) {
  return [node, `scripts/ops/${tool}.mjs`, ...args]
}

/** @param {string} node @param {Place['folder']} folder @param {string} [expectVersion] */
function healthArgv(node, folder, expectVersion) {
  const argv = toolArgv(node, 'health-check', [
    '--url',
    healthUrl(folder.port, folder.clientId),
    '--timeout',
    String(HEALTH_TIMEOUT_SECONDS),
    '--stable',
    String(HEALTH_STABLE_SECONDS),
  ])
  if (expectVersion) argv.push('--version', expectVersion)
  return argv
}

/**
 * Runs programs, prints what they print, and stops the flow when one fails.
 * @param {{ run: InstallDeps['run'], log: (line: string) => void, dryRun: boolean }} input
 */
function createRun({ run: execute, log, dryRun }) {
  /**
   * @param {string[]} argv
   * @param {{ cwd?: string, label: string, timeoutMs?: number, allowFail?: boolean, quiet?: boolean }} options
   * @returns {RunResult}
   */
  return function run(argv, { cwd, label, timeoutMs, allowFail = false, quiet = false }) {
    if (dryRun) {
      log(`  (dry run) would run: ${cwd ? `[${cwd}] ` : ''}${argv.join(' ')}`)
      return { code: 0, stdout: '', stderr: '' }
    }
    const result = execute(argv, { cwd, timeoutMs })
    if (!quiet) for (const line of result.stdout.split(/\r?\n/)) if (line.trim() !== '') log(`    ${line}`)
    if (result.code !== 0) {
      for (const line of result.stderr.split(/\r?\n/)) if (line.trim() !== '') log(`    ! ${line}`)
      if (!allowFail) {
        const hint = result.code === 124 ? ' (it took too long and was stopped)' : ''
        throw new InstallError(`${label} failed (exit code ${result.code})${hint}`)
      }
    }
    return result
  }
}

/** The version of the release that is current; an empty text when it cannot be read. */
function currentVersion(run, place, node) {
  const listed = run(toolArgv(node, 'release', ['list', '--root', place.root, '--json']), {
    cwd: place.releaseDir,
    label: 'list the releases',
    allowFail: true,
    quiet: true,
  })
  try {
    const data = JSON.parse(listed.stdout)
    return String(
      data.releases?.find((/** @type {{ name: string }} */ release) => release.name === data.current)?.version ?? '',
    )
  } catch {
    return ''
  }
}

/**
 * Restarts the service and waits until the health address answers well (and, when given, with this version).
 * @returns {{ ok: boolean, reason: string }}
 */
function restartAndWait(run, place, node, expectVersion) {
  const restarted = run(['sudo', '-n', 'systemctl', 'restart', place.folder.unit], {
    label: 'restart the service',
    allowFail: true,
  })
  if (restarted.code !== 0) {
    return {
      ok: false,
      reason: `the service could not be restarted (exit code ${restarted.code}); is "sudo -n systemctl restart" allowed for this user?`,
    }
  }
  const checked = run(healthArgv(node, place.folder, expectVersion), {
    cwd: place.releaseDir,
    label: 'health check',
    allowFail: true,
    timeoutMs: (HEALTH_TIMEOUT_SECONDS + 60) * 1000,
  })
  return checked.code === 0 ? { ok: true, reason: '' } : { ok: false, reason: 'the health check did not pass' }
}

/**
 * Puts the open-package.mjs of this release into the deploy folder, so that the copy the owner uploaded once never goes
 * stale. It never fails the install: the release is already running (or prepared) when this is called.
 * @param {{ deps: InstallDeps, place: Place, dryRun: boolean }} input
 */
function refreshOpener({ deps, place, dryRun }) {
  if (dryRun) {
    deps.log(`  (dry run) would refresh ${place.root}/open-package.mjs from this release`)
    return
  }
  try {
    const outcome = deps.refreshOpener(place.releaseDir, place.root)
    if (outcome === 'added')
      deps.log(`\n  open-package.mjs was missing in the deploy folder; copied from this release.`)
    else if (outcome === 'updated') deps.log(`\n  open-package.mjs in the deploy folder was updated from this release.`)
  } catch (error) {
    deps.log(
      `\n  Could not refresh open-package.mjs (${error instanceof Error ? error.message : String(error)}); copy it by hand if it is out of date.`,
    )
  }
}

/** @param {string} root */
function lockPath(root) {
  return `${root}/.deploy.lock`
}

/** @param {string} lockDir */
function lockHeldMessage(lockDir) {
  return `another install is running on this server, or one left its lock behind (${lockDir}). If you are sure none is running, remove it with: rm -r ${lockDir}`
}

/**
 * What every stage of an install shares: the place, the options, the way programs are run, the numbering of the headings
 * and the two facts the final cleanup needs (is the lock taken, was the release switched).
 * @param {{ place: Place, options: InstallOptions, deps: InstallDeps }} input
 */
function createInstallContext({ place, options, deps }) {
  const dryRun = options.dryRun === true
  let step = 0
  return {
    place,
    options,
    deps,
    dryRun,
    run: createRun({ run: deps.run, log: deps.log, dryRun }),
    node: deps.nodePath,
    envFile: `${place.root}/${ENV_FILE_NAME}`,
    lockDir: lockPath(place.root),
    /** @param {string} text */
    heading: (text) => deps.log(`\n[${++step}] ${text}`),
    /** What the cleanup at the end needs to know. */
    state: { locked: false, activated: false },
  }
}

/** @typedef {ReturnType<typeof createInstallContext>} InstallContext */

/**
 * Stage: the package is complete, its version is a release tag for this environment, and it was built for this deployment.
 * @param {InstallContext} ctx
 * @returns {string} the version of the release
 */
function checkRelease(ctx) {
  const { deps, place, heading } = ctx
  const { name, releaseDir, folder } = place
  heading(`Check this release (${name})`)
  const info = deps.readBuildInfo(releaseDir)
  if (!info) throw new InstallError('dist/build-info.json is missing or unreadable: was the package opened completely?')
  if (!info.version) throw new InstallError('dist/build-info.json has no version')
  const versionProblem = installVersionProblem(info.version, folder.env)
  if (versionProblem) throw new InstallError(versionProblem)
  if (info.clientId !== folder.clientId) {
    throw new InstallError(
      `this package was built for CLIENT_ID "${info.clientId ?? ''}" but this deploy folder is for "${folder.clientId}": wrong package or wrong folder`,
    )
  }
  deps.log(`  version ${info.version}, built for ${folder.clientId}`)
  return info.version
}

/** Stage: the environment file of the deployment exists (not needed to prepare a first install). @param {InstallContext} ctx */
function checkEnvFile(ctx) {
  const { deps, envFile, heading } = ctx
  heading('Check the environment file')
  if (!deps.exists(envFile)) {
    throw new InstallError(
      `${envFile} does not exist. For the first install of a deployment, run this script with --prepare-only, then create the file with init-env.`,
    )
  }
}

/** Stage: only one install runs at a time on a server. @param {InstallContext} ctx */
function takeLock(ctx) {
  const { deps, dryRun, heading, lockDir, state } = ctx
  heading('Take the install lock')
  if (dryRun) {
    deps.log(`  (dry run) would create ${lockDir}`)
    return
  }
  if (!deps.makeLock(lockDir)) throw new InstallError(lockHeldMessage(lockDir))
  state.locked = true
}

/** Stage: checks the server (not when only preparing), then installs the packages of the release. @param {InstallContext} ctx */
function installPackages(ctx) {
  const { deps, heading, node, options, place, run } = ctx
  heading('Install the packages')
  if (!options.prepareOnly) {
    run(toolArgv(node, 'release', ['doctor', '--root', place.root]), {
      cwd: place.releaseDir,
      label: 'check the server (doctor)',
    })
  }
  run([deps.npmPath, 'ci', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: place.releaseDir,
    label: 'install the packages (npm ci)',
    timeoutMs: 20 * MINUTE_MS,
  })
}

/** End of a prepare-only install: nothing is switched; tells the person what to do next. @param {InstallContext} ctx */
function finishPrepare(ctx) {
  const { dryRun, deps, envFile, node, place } = ctx
  const { name, releaseDir, folder } = place
  refreshOpener({ deps, place, dryRun })
  deps.log(`\nPREPARED ${name}. Nothing is switched. Next, create the environment file:`)
  deps.log(
    `  ${node} ${releaseDir}/scripts/ops/init-env.mjs create --client ${folder.client} --env ${folder.env} --port ${folder.port} --file ${envFile}`,
  )
  deps.log('then fill in DATABASE_URL and LOG_DIR, and run the installer again without --prepare-only:')
  deps.log(`  ${node} ${releaseDir}/scripts/ops/install.mjs`)
}

/** Stage: the environment file passes the checks of the environment. @param {InstallContext} ctx */
function checkSettings(ctx) {
  const { envFile, heading, node, place, run } = ctx
  heading('Check the settings')
  run(toolArgv(node, 'env-check', [envFile]), {
    cwd: place.releaseDir,
    label: 'check the environment file (env-check)',
  })
}

/** Stage: the database migrations of this release run BEFORE the release is switched. @param {InstallContext} ctx */
function applyMigrations(ctx) {
  const { envFile, heading, node, place, run } = ctx
  heading('Apply the database migrations')
  run([node, `--env-file=${envFile}`, 'dist/ops/dash-migrate.mjs'], {
    cwd: place.releaseDir,
    label: 'apply the database migrations',
    timeoutMs: 30 * MINUTE_MS,
  })
}

/**
 * Stage: makes this release the current one.
 * @param {InstallContext} ctx
 * @returns {boolean} whether there was a release before, to go back to
 */
function switchRelease(ctx) {
  const { heading, node, place, run, state } = ctx
  heading('Switch to this release')
  const switched = run(toolArgv(node, 'release', ['activate', '--root', place.root, '--release', place.name]), {
    cwd: place.releaseDir,
    label: 'switch to this release',
  })
  state.activated = true
  const previous = /^previous (\S+)$/m.exec(switched.stdout)?.[1]
  return previous !== undefined && previous !== 'none'
}

/**
 * Stage: restarts the service and waits for the new version to answer well. When it does not, goes back to the previous
 * release; this always ends in an InstallError ("rolled-back" or "rollback-failed") unless the release is healthy.
 * @param {InstallContext} ctx
 * @param {string} version the version that must answer
 * @param {boolean} hadPrevious
 */
function waitUntilHealthy(ctx, version, hadPrevious) {
  const { deps, heading, node, place, run } = ctx
  const { root, releaseDir } = place
  heading('Restart and wait until it is healthy')
  const health = restartAndWait(run, place, node, version)
  if (health.ok) return

  deps.log(`\n  This release is not healthy: ${health.reason}`)
  if (!hadPrevious) {
    throw new InstallError(
      'there is no previous release to go back to, so the service is left as it is. Look at the log of the service (journalctl) and fix it.',
    )
  }
  heading('Go back to the previous release')
  const back = run(toolArgv(node, 'release', ['rollback', '--root', root]), {
    cwd: releaseDir,
    label: 'go back to the previous release',
    allowFail: true,
  })
  if (back.code !== 0) {
    throw new InstallError(
      `ACTION NEEDED: this release is not healthy and the switch back failed. The "current" link may point at this release. Check ${root} by hand: node scripts/ops/release.mjs list --root ${root}`,
      'rollback-failed',
    )
  }
  const previousVersion = currentVersion(run, place, node)
  const again = restartAndWait(run, place, node, previousVersion || undefined)
  if (!again.ok) {
    throw new InstallError(
      `ACTION NEEDED: the previous release does not answer either (${again.reason}). Look at the log of the service (journalctl) now.`,
      'rollback-failed',
    )
  }
  throw new InstallError(
    `ROLLED BACK: ${version} was not healthy (${health.reason}); the previous release${previousVersion ? ` (${previousVersion})` : ''} is running again. Fix the problem and install a new package.`,
    'rolled-back',
  )
}

/** Stage: removes old releases and refreshes open-package.mjs; neither can fail the install. @param {InstallContext} ctx */
function cleanUp(ctx) {
  const { deps, dryRun, heading, node, options, place, run } = ctx
  heading('Clean up old releases')
  run(toolArgv(node, 'release', ['cleanup', '--root', place.root, '--keep', String(options.keep ?? DEFAULT_KEEP)]), {
    cwd: place.releaseDir,
    label: 'clean up old releases',
    allowFail: true,
  })
  refreshOpener({ deps, place, dryRun })
}

/**
 * Installs the release this script belongs to, as described in docs/project-guide.md chapter 10.9. The work is done by
 * the stages above, in this order; the lock is always given back at the end.
 * @param {{ place: Place, options?: InstallOptions, deps: InstallDeps }} input
 * @returns {InstallResult}
 */
export function runInstall({ place, options = {}, deps }) {
  const { log, now } = deps
  const ctx = createInstallContext({ place, options, deps })
  const startedAt = now().getTime()

  /** @type {InstallResult} */
  const result = { ok: false, status: 'failed', release: place.name, version: '' }

  try {
    const version = checkRelease(ctx)
    result.version = version
    if (!options.prepareOnly) checkEnvFile(ctx)
    takeLock(ctx)
    installPackages(ctx)

    if (options.prepareOnly) {
      finishPrepare(ctx)
      result.ok = true
      result.status = 'prepared'
      return result
    }

    checkSettings(ctx)
    applyMigrations(ctx)
    const hadPrevious = switchRelease(ctx)
    waitUntilHealthy(ctx, version, hadPrevious)
    cleanUp(ctx)

    result.ok = true
    result.status = ctx.dryRun ? 'dry-run' : 'installed'
    const seconds = Math.round((now().getTime() - startedAt) / 1000)
    log(
      ctx.dryRun
        ? '\nDRY RUN finished: nothing was changed.'
        : `\nINSTALLED ${version} as the current release of ${basename(place.root)} (${place.name}) in ${seconds} s`,
    )
  } catch (error) {
    if (!(error instanceof InstallError)) throw error
    result.status = error.status
    log(`\n${error.status === 'failed' ? 'FAILED: ' : ''}${error.message}`)
    // Nothing was switched: the release folder stays, so that the same command can be run again after the fix.
    if (!ctx.state.activated && error.status === 'failed')
      log('The release folder was kept. After fixing the problem, run the same command again.')
  } finally {
    if (ctx.state.locked) deps.removeLock(ctx.lockDir)
  }
  return result
}

/**
 * Goes back to the previous release by hand (the same switch the installer does by itself when a release is not healthy).
 * @param {{ place: Place, options?: Pick<InstallOptions, 'dryRun'>, deps: InstallDeps }} input
 * @returns {InstallResult}
 */
export function runRollback({ place, options = {}, deps }) {
  const { log } = deps
  const { root, releaseDir } = place
  const dryRun = options.dryRun === true
  const run = createRun({ run: deps.run, log, dryRun })
  const node = deps.nodePath
  const lockDir = lockPath(root)
  /** @type {InstallResult} */
  const result = { ok: false, status: 'failed', release: '', version: '' }
  let locked = false
  let step = 0
  /** @param {string} text */
  const heading = (text) => log(`\n[${++step}] ${text}`)

  try {
    heading('Take the install lock')
    if (dryRun) {
      log(`  (dry run) would create ${lockDir}`)
    } else {
      if (!deps.makeLock(lockDir)) throw new InstallError(lockHeldMessage(lockDir))
      locked = true
    }

    heading('Go back to the previous release')
    const back = run(toolArgv(node, 'release', ['rollback', '--root', root]), {
      cwd: releaseDir,
      label: 'go back to the previous release',
      allowFail: true,
    })
    if (back.code !== 0) throw new InstallError('there is no previous release to go back to (see the message above)')
    result.release = /^rolled back to (\S+)$/m.exec(back.stdout)?.[1] ?? ''
    const version = currentVersion(run, place, node)
    result.version = version

    heading('Restart and wait until it is healthy')
    const health = restartAndWait(run, place, node, version || undefined)
    if (!health.ok) {
      throw new InstallError(
        `ACTION NEEDED: the release was switched back but it is not healthy (${health.reason}). Look at the log of the service (journalctl) now.`,
        'rollback-failed',
      )
    }
    result.ok = true
    result.status = dryRun ? 'dry-run' : 'rolled-back'
    log(
      dryRun
        ? '\nDRY RUN finished: nothing was changed.'
        : `\nROLLED BACK to ${result.release}${version ? ` (${version})` : ''}`,
    )
  } catch (error) {
    if (!(error instanceof InstallError)) throw error
    result.status = error.status
    log(`\n${error.status === 'failed' ? 'FAILED: ' : ''}${error.message}`)
  } finally {
    if (locked) deps.removeLock(lockDir)
  }
  return result
}

/**
 * Shows the releases and asks the health address once.
 * @param {{ place: Place, deps: InstallDeps }} input
 * @returns {InstallResult}
 */
export function runStatus({ place, deps }) {
  const { log } = deps
  const run = createRun({ run: deps.run, log, dryRun: false })
  const node = deps.nodePath
  /** @type {InstallResult} */
  const result = { ok: false, status: 'failed', release: '', version: '' }
  log(`\nReleases of ${basename(place.root)}:`)
  if (!deps.exists(`${place.root}/current`)) {
    log('\nFAILED: there is no "current" release: nothing is installed in this folder yet')
    return result
  }
  run(toolArgv(node, 'release', ['list', '--root', place.root]), {
    cwd: place.releaseDir,
    label: 'list the releases',
    allowFail: true,
  })
  log('\nHealth:')
  const health = run(
    toolArgv(node, 'health-check', ['--url', healthUrl(place.folder.port, place.folder.clientId), '--once']),
    { cwd: place.releaseDir, label: 'health check', allowFail: true },
  )
  result.ok = health.code === 0
  result.status = result.ok ? 'installed' : 'failed'
  result.version = currentVersion(run, place, node)
  return result
}
