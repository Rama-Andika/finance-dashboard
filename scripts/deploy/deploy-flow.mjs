import { ENV_FILE_NAME, healthUrl, releaseName } from '../lib/release-layout.mjs'
import { describeWindow, isInsideDeployWindow, versionProblems } from './deploy-rules.mjs'

/** How many releases stay on the server after a deploy (plus the current and the previous one). */
export const DEFAULT_KEEP = 5
const HEALTH_TIMEOUT_SECONDS = 120
const HEALTH_STABLE_SECONDS = 10
const MINUTE_MS = 60 * 1000

/**
 * @typedef {'deployed' | 'rolled-back' | 'rollback-failed' | 'failed' | 'prepared' | 'dry-run'} DeployStatus
 * @typedef {{ ok: boolean, status: DeployStatus, release: string, version: string }} DeployResult
 * @typedef {import('./targets.mjs').Target} Target
 * @typedef {import('./transport.mjs').RunResult} RunResult
 * @typedef {{
 *   dryRun?: boolean, forceWindow?: boolean, skipBuild?: boolean, allowDirty?: boolean,
 *   prepareOnly?: boolean, yes?: boolean, keep?: number,
 * }} DeployOptions
 * @typedef {{
 *   now: () => Date,
 *   log: (line: string) => void,
 *   git: { describe: () => string, exactTag: () => string | null, isDirty: () => boolean },
 *   build: (clientId: string) => boolean,
 *   readBuildInfo: () => { version?: string, clientId?: string } | null,
 *   scanBundle: () => { problems: string[], files: number },
 *   packageRelease: (name: string) => { archive: string, sizeBytes: number, dispose: () => void },
 *   transport: {
 *     run: (argv: string[], options?: { cwd?: string, timeoutMs?: number }) => RunResult,
 *     upload: (localFile: string, remoteFile: string) => RunResult,
 *   },
 *   confirm: (input: { question: string, expected: string }) => Promise<boolean>,
 * }} DeployDeps
 */

/** A failure with a message for the person. `status` says what state the server is left in. */
class DeployError extends Error {
  /** @param {string} message @param {DeployStatus} [status] */
  constructor(message, status = 'failed') {
    super(message)
    this.status = status
  }
}

/** @param {number} code */
function hintFor(code) {
  if (code === 255)
    return ' (ssh could not connect or was refused: network, key, or a host key you have not accepted yet; connect once by hand)'
  if (code === 124) return ' (it took too long and was stopped)'
  return ''
}

/** Everything on the server that a deploy touches, as absolute paths. @param {Target} target @param {string} [name] the release name */
function serverPaths(target, name = '') {
  const releases = `${target.root}/releases`
  return {
    envFile: `${target.root}/${ENV_FILE_NAME}`,
    lockDir: `${target.root}/.deploy.lock`,
    incoming: `${releases}/.incoming`,
    archive: `${releases}/.incoming/${name}.tgz`,
    tempDir: `${releases}/.tmp-${name}`,
    releaseDir: `${releases}/${name}`,
    currentDir: `${target.root}/current`,
  }
}

/** A script of scripts/ops run with the Node of the target. @param {Target} target @param {string} tool @param {string[]} args */
function toolArgv(target, tool, args) {
  return [target.nodePath, `scripts/ops/${tool}.mjs`, ...args]
}

/** @param {Target} target @param {string} [expectVersion] */
function healthArgv(target, expectVersion) {
  const argv = toolArgv(target, 'health-check', [
    '--url',
    healthUrl(target.port, target.clientId),
    '--timeout',
    String(HEALTH_TIMEOUT_SECONDS),
    '--stable',
    String(HEALTH_STABLE_SECONDS),
  ])
  if (expectVersion) argv.push('--version', expectVersion)
  return argv
}

/**
 * Runs programs on the server, prints what they print, and stops the flow when one fails.
 * @param {{ transport: DeployDeps['transport'], log: (line: string) => void, dryRun: boolean }} input
 */
function createRemote({ transport, log, dryRun }) {
  /**
   * @param {string[]} argv
   * @param {{ cwd?: string, label: string, timeoutMs?: number, allowFail?: boolean, quiet?: boolean }} options
   * @returns {RunResult}
   */
  return function remote(argv, { cwd, label, timeoutMs, allowFail = false, quiet = false }) {
    if (dryRun) {
      log(`  (dry run) would run: ${cwd ? `[${cwd}] ` : ''}${argv.join(' ')}`)
      return { code: 0, stdout: '', stderr: '' }
    }
    const result = transport.run(argv, { cwd, timeoutMs })
    if (!quiet) for (const line of result.stdout.split(/\r?\n/)) if (line.trim() !== '') log(`    ${line}`)
    if (result.code !== 0) {
      for (const line of result.stderr.split(/\r?\n/)) if (line.trim() !== '') log(`    ! ${line}`)
      if (!allowFail) throw new DeployError(`${label} failed (exit code ${result.code})${hintFor(result.code)}`)
    }
    return result
  }
}

/** The version of the release that is current on the server; an empty text when it cannot be read. */
function currentVersion(remote, target, cwd) {
  const listed = remote(toolArgv(target, 'release', ['list', '--root', target.root, '--json']), {
    cwd,
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
function restartAndWait(remote, target, cwd, expectVersion) {
  const restarted = remote(['sudo', '-n', 'systemctl', 'restart', target.unit], {
    label: 'restart the service',
    allowFail: true,
  })
  if (restarted.code !== 0) {
    return {
      ok: false,
      reason: `the service could not be restarted (exit code ${restarted.code}); is "sudo -n systemctl restart" allowed for this user?`,
    }
  }
  const checked = remote(healthArgv(target, expectVersion), {
    cwd,
    label: 'health check',
    allowFail: true,
    timeoutMs: (HEALTH_TIMEOUT_SECONDS + 60) * 1000,
  })
  return checked.code === 0 ? { ok: true, reason: '' } : { ok: false, reason: 'the health check did not pass' }
}

/**
 * Deploys the current commit to one target.
 * @param {{ target: Target, options?: DeployOptions, deps: DeployDeps }} input
 * @returns {Promise<DeployResult>}
 */
export async function runDeploy({ target, options = {}, deps }) {
  const { log, now } = deps
  const dryRun = options.dryRun === true
  const keep = options.keep ?? DEFAULT_KEEP
  const remote = createRemote({ transport: deps.transport, log, dryRun })
  const startedAt = now().getTime()
  let step = 0
  /** @param {string} text */
  const heading = (text) => log(`\n[${++step}] ${text}`)

  /** @type {DeployResult} */
  const result = { ok: false, status: 'failed', release: '', version: '' }
  let locked = false
  let unpacked = false
  let activated = false
  /** @type {{ archive: string, sizeBytes: number, dispose: () => void } | null} */
  let packaged = null
  /** @type {ReturnType<typeof serverPaths> | null} */
  let paths = null

  try {
    heading(`Check the rules for ${target.name} (${target.env})`)
    if (target.env === 'production') {
      if (isInsideDeployWindow(now(), target.timezone)) {
        log(`  inside the deploy window ${describeWindow(target.timezone)}`)
      } else if (options.forceWindow) {
        log(
          `  WARNING: outside the deploy window ${describeWindow(target.timezone)}; continuing because of --force-window`,
        )
      } else {
        throw new DeployError(
          `production is deployed only from ${describeWindow(target.timezone)}, and it is not that time at ${target.name} now. Wait for the window, or use --force-window in an emergency.`,
        )
      }
    }
    const buildVersion = deps.git.describe()
    const problems = versionProblems({
      env: target.env,
      buildVersion,
      exactTag: deps.git.exactTag(),
      treeDirty: deps.git.isDirty(),
      allowDirty: options.allowDirty === true,
    })
    if (problems.length > 0) throw new DeployError(`this version cannot be deployed:\n  - ${problems.join('\n  - ')}`)
    log(`  version ${buildVersion}`)
    const name = releaseName(buildVersion, now())
    result.version = buildVersion
    result.release = name
    paths = serverPaths(target, name)

    if (target.env === 'production' && !dryRun && !options.yes) {
      const confirmed = await deps.confirm({
        question: `Deploy ${buildVersion} to PRODUCTION target "${target.name}". Type the target name to continue: `,
        expected: target.name,
      })
      if (!confirmed) throw new DeployError('cancelled; nothing was changed')
    }

    heading('Build')
    if (dryRun) {
      log(`  (dry run) would build for CLIENT_ID=${target.clientId}: build:client, then build:ops`)
    } else if (options.skipBuild) {
      log('  skipped (--skip-build): the existing dist/ is used')
    } else {
      log(`  building for CLIENT_ID=${target.clientId} ...`)
      if (!deps.build(target.clientId)) throw new DeployError('the build failed')
    }

    heading('Check the build')
    if (dryRun) {
      log('  (dry run) would check dist/build-info.json and the packages the server imports')
    } else {
      const info = deps.readBuildInfo()
      if (!info) throw new DeployError('dist/build-info.json is missing or unreadable; build first')
      if (info.clientId !== target.clientId) {
        throw new DeployError(
          `the build in dist/ was made for CLIENT_ID "${info.clientId ?? ''}" but this target needs "${target.clientId}"; build again without --skip-build`,
        )
      }
      if (info.version !== buildVersion) {
        throw new DeployError(
          `the build says version "${info.version ?? ''}" but git says "${buildVersion}". Either the build changed a tracked file (look at git status) or dist/ comes from another commit. Fix that and build again.`,
        )
      }
      const scan = deps.scanBundle()
      if (scan.problems.length > 0)
        throw new DeployError(`the build would not run on the server:\n  - ${scan.problems.join('\n  - ')}`)
      log(`  ok: version ${info.version}, ${scan.files} files checked`)
    }

    heading('Package the release')
    if (dryRun) {
      log(`  (dry run) would make ${name}.tgz`)
    } else {
      packaged = deps.packageRelease(name)
      log(`  ${name}.tgz (${(packaged.sizeBytes / (1024 * 1024)).toFixed(1)} MB)`)
    }

    heading(`Check the server (${target.ssh})`)
    const folder = remote(['test', '-d', target.root], { label: 'check the deploy folder', allowFail: true })
    if (folder.code === 255 || folder.code === 124)
      throw new DeployError(`cannot reach the server${hintFor(folder.code)}`)
    if (folder.code !== 0) {
      throw new DeployError(
        `the deploy folder ${target.root} does not exist on the server; create it first (docs/project-guide.md chapter 10.9)`,
      )
    }
    if (!options.prepareOnly) {
      const envFile = remote(['test', '-f', paths.envFile], { label: 'check the environment file', allowFail: true })
      if (envFile.code !== 0) {
        throw new DeployError(
          `${paths.envFile} does not exist. For a first deploy, run once with --prepare-only, then create the file with init-env (docs/project-guide.md chapter 10.9).`,
        )
      }
    }

    heading('Take the deploy lock')
    const lock = remote(['mkdir', paths.lockDir], { label: 'take the deploy lock', allowFail: true })
    if (lock.code !== 0) {
      throw new DeployError(
        `another deploy is running on this server, or one left its lock behind (${paths.lockDir}). If you are sure none is running, remove it with: ssh ${target.ssh} rm -r ${paths.lockDir}`,
      )
    }
    locked = true

    heading('Upload and unpack')
    remote(['mkdir', '-p', paths.incoming], { label: 'create the upload folder' })
    if (dryRun || packaged === null) {
      log(`  (dry run) would upload ${name}.tgz to ${paths.archive}`)
    } else {
      const uploaded = deps.transport.upload(packaged.archive, paths.archive)
      if (uploaded.code !== 0)
        throw new DeployError(`the upload failed (exit code ${uploaded.code})${hintFor(uploaded.code)}`)
    }
    remote(['mkdir', paths.tempDir], { label: 'create the temporary folder' })
    remote(['tar', '-xzf', paths.archive, '-C', paths.tempDir], { label: 'unpack the archive' })
    remote(['mv', paths.tempDir, paths.releaseDir], { label: 'name the release' })
    unpacked = true
    remote(['rm', '-f', paths.archive], { label: 'remove the archive', allowFail: true })

    heading('Install the packages on the server')
    if (!options.prepareOnly) {
      remote(toolArgv(target, 'release', ['doctor', '--root', target.root]), {
        cwd: paths.releaseDir,
        label: 'check the server (doctor)',
      })
    }
    remote([target.npmPath, 'ci', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: paths.releaseDir,
      label: 'install the packages (npm ci)',
      timeoutMs: 20 * MINUTE_MS,
    })

    if (options.prepareOnly) {
      result.ok = true
      result.status = 'prepared'
      log(`\nPREPARED ${name} on ${target.name}. Nothing is switched. Next, create the environment file with:`)
      log(
        `  ssh ${target.ssh} ${target.nodePath} ${paths.releaseDir}/scripts/ops/init-env.mjs create --client ${target.client} --env ${target.env} --port ${target.port} --file ${paths.envFile}`,
      )
      log('then fill in DATABASE_URL and LOG_DIR, and deploy again without --prepare-only.')
      return result
    }

    heading('Check the settings')
    remote(toolArgv(target, 'env-check', [paths.envFile]), {
      cwd: paths.releaseDir,
      label: 'check the environment file (env-check)',
    })

    heading('Apply the database migrations')
    remote([target.nodePath, `--env-file=${paths.envFile}`, 'dist/ops/dash-migrate.mjs'], {
      cwd: paths.releaseDir,
      label: 'apply the database migrations',
      timeoutMs: 30 * MINUTE_MS,
    })

    heading('Switch to the new release')
    const switched = remote(toolArgv(target, 'release', ['activate', '--root', target.root, '--release', name]), {
      cwd: paths.releaseDir,
      label: 'switch to the new release',
    })
    activated = true
    const previous = /^previous (\S+)$/m.exec(switched.stdout)?.[1]
    const hadPrevious = previous !== undefined && previous !== 'none'

    heading('Restart and wait until it is healthy')
    const health = restartAndWait(remote, target, paths.releaseDir, buildVersion)
    if (!health.ok) {
      log(`\n  The new release is not healthy: ${health.reason}`)
      if (!hadPrevious) {
        throw new DeployError(
          'there is no previous release to go back to, so the service is left as it is. Look at the log of the service (journalctl) and fix it.',
        )
      }
      heading('Go back to the previous release')
      const back = remote(toolArgv(target, 'release', ['rollback', '--root', target.root]), {
        cwd: paths.releaseDir,
        label: 'go back to the previous release',
        allowFail: true,
      })
      if (back.code !== 0) {
        throw new DeployError(
          `ACTION NEEDED: the new release is not healthy and the switch back failed. The "current" link may point at the new release. Check ${target.root} by hand: node scripts/ops/release.mjs list --root ${target.root}`,
          'rollback-failed',
        )
      }
      const previousVersion = currentVersion(remote, target, paths.releaseDir)
      const again = restartAndWait(remote, target, paths.releaseDir, previousVersion || undefined)
      if (!again.ok) {
        throw new DeployError(
          `ACTION NEEDED: the previous release does not answer either (${again.reason}). Look at the log of the service (journalctl) now.`,
          'rollback-failed',
        )
      }
      throw new DeployError(
        `ROLLED BACK: ${buildVersion} was not healthy (${health.reason}); the previous release${previousVersion ? ` (${previousVersion})` : ''} is running again. Fix the problem and deploy again.`,
        'rolled-back',
      )
    }

    heading('Clean up old releases')
    remote(toolArgv(target, 'release', ['cleanup', '--root', target.root, '--keep', String(keep)]), {
      cwd: paths.releaseDir,
      label: 'clean up old releases',
      allowFail: true,
    })

    result.ok = true
    result.status = dryRun ? 'dry-run' : 'deployed'
    const seconds = Math.round((now().getTime() - startedAt) / 1000)
    log(
      dryRun
        ? `\nDRY RUN finished: nothing was built, sent or changed.`
        : `\nDEPLOYED ${buildVersion} to ${target.name} (release ${name}) in ${seconds} s`,
    )
  } catch (error) {
    if (!(error instanceof DeployError)) throw error
    result.status = error.status
    log(`\n${error.status === 'failed' ? 'FAILED: ' : ''}${error.message}`)
    // A release that was unpacked but never switched to is of no use: remove it.
    if (unpacked && !activated && paths)
      remote(['rm', '-rf', paths.releaseDir], { label: 'remove the unused release', allowFail: true })
  } finally {
    if (locked && paths) remote(['rm', '-rf', paths.lockDir], { label: 'release the deploy lock', allowFail: true })
    packaged?.dispose()
  }
  return result
}

/**
 * Goes back to the previous release on the server, by hand (the same switch the deploy does by itself when a release is not healthy).
 * @param {{ target: Target, options?: Pick<DeployOptions, 'dryRun' | 'yes'>, deps: DeployDeps }} input
 * @returns {Promise<DeployResult>}
 */
export async function runRollback({ target, options = {}, deps }) {
  const { log } = deps
  const dryRun = options.dryRun === true
  const remote = createRemote({ transport: deps.transport, log, dryRun })
  const paths = serverPaths(target)
  /** @type {DeployResult} */
  const result = { ok: false, status: 'failed', release: '', version: '' }
  let locked = false
  let step = 0
  /** @param {string} text */
  const heading = (text) => log(`\n[${++step}] ${text}`)

  try {
    if (target.env === 'production' && !dryRun && !options.yes) {
      const confirmed = await deps.confirm({
        question: `Roll PRODUCTION target "${target.name}" back to its previous release. Type the target name to continue: `,
        expected: target.name,
      })
      if (!confirmed) throw new DeployError('cancelled; nothing was changed')
    }
    heading(`Check the server (${target.ssh})`)
    const current = remote(['test', '-L', paths.currentDir], { label: 'check the current release', allowFail: true })
    if (current.code === 255 || current.code === 124)
      throw new DeployError(`cannot reach the server${hintFor(current.code)}`)
    if (current.code !== 0)
      throw new DeployError(`${paths.currentDir} does not exist: no release is installed on this server yet`)

    heading('Take the deploy lock')
    const lock = remote(['mkdir', paths.lockDir], { label: 'take the deploy lock', allowFail: true })
    if (lock.code !== 0) {
      throw new DeployError(
        `another deploy is running on this server, or one left its lock behind (${paths.lockDir}). If you are sure none is running, remove it with: ssh ${target.ssh} rm -r ${paths.lockDir}`,
      )
    }
    locked = true

    heading('Go back to the previous release')
    const back = remote(toolArgv(target, 'release', ['rollback', '--root', target.root]), {
      cwd: paths.currentDir,
      label: 'go back to the previous release',
      allowFail: true,
    })
    if (back.code !== 0) throw new DeployError('there is no previous release to go back to (see the message above)')
    result.release = /^rolled back to (\S+)$/m.exec(back.stdout)?.[1] ?? ''
    const version = currentVersion(remote, target, paths.currentDir)
    result.version = version

    heading('Restart and wait until it is healthy')
    const health = restartAndWait(remote, target, paths.currentDir, version || undefined)
    if (!health.ok) {
      throw new DeployError(
        `ACTION NEEDED: the release was switched back but it is not healthy (${health.reason}). Look at the log of the service (journalctl) now.`,
        'rollback-failed',
      )
    }
    result.ok = true
    result.status = dryRun ? 'dry-run' : 'rolled-back'
    log(
      dryRun
        ? '\nDRY RUN finished: nothing was changed.'
        : `\nROLLED BACK ${target.name} to ${result.release}${version ? ` (${version})` : ''}`,
    )
  } catch (error) {
    if (!(error instanceof DeployError)) throw error
    result.status = error.status
    log(`\n${error.status === 'failed' ? 'FAILED: ' : ''}${error.message}`)
  } finally {
    if (locked) remote(['rm', '-rf', paths.lockDir], { label: 'release the deploy lock', allowFail: true })
  }
  return result
}

/**
 * Shows the releases on the server and asks the health address once.
 * @param {{ target: Target, deps: DeployDeps }} input
 * @returns {Promise<DeployResult>}
 */
export async function runStatus({ target, deps }) {
  const { log } = deps
  const remote = createRemote({ transport: deps.transport, log, dryRun: false })
  const paths = serverPaths(target)
  /** @type {DeployResult} */
  const result = { ok: false, status: 'failed', release: '', version: '' }
  try {
    log(`\nReleases of ${target.name} (${target.ssh}):`)
    const exists = remote(['test', '-L', paths.currentDir], { label: 'check the current release', allowFail: true })
    if (exists.code === 255 || exists.code === 124)
      throw new DeployError(`cannot reach the server${hintFor(exists.code)}`)
    if (exists.code !== 0)
      throw new DeployError(`${paths.currentDir} does not exist: no release is installed on this server yet`)
    remote(toolArgv(target, 'release', ['list', '--root', target.root]), {
      cwd: paths.currentDir,
      label: 'list the releases',
    })
    log('\nHealth:')
    const health = remote(
      toolArgv(target, 'health-check', ['--url', healthUrl(target.port, target.clientId), '--once']),
      { cwd: paths.currentDir, label: 'health check', allowFail: true },
    )
    result.ok = health.code === 0
    result.status = result.ok ? 'deployed' : 'failed'
    result.version = currentVersion(remote, target, paths.currentDir)
  } catch (error) {
    if (!(error instanceof DeployError)) throw error
    log(`\nFAILED: ${error.message}`)
  }
  return result
}
