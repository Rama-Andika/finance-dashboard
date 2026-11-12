// Installs the release this script belongs to on a server: checks the release, takes the install lock, runs doctor, npm ci,
// env-check and the database migrations, switches "current", restarts the service, waits for /health, and goes back to the
// previous release by itself when the new one is not healthy. Plain Node, no dependencies. The deploy folder is read from
// the place of this file: <deploy folder>/releases/<release name>/scripts/ops/install.mjs. It is normally started by
// open-package.mjs, which opens the package first. See docs/project-guide.md chapter 10.9.
//
//   node <deploy folder>/releases/<release name>/scripts/ops/install.mjs [--prepare-only] [--keep <n>] [--dry-run]
//   node <deploy folder>/current/scripts/ops/install.mjs --rollback [--dry-run]
//   node <deploy folder>/current/scripts/ops/install.mjs --status
//
// Exit code: 0 done, 1 not done (the message says why), 2 wrong use.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_KEEP, locateRelease, runInstall, runRollback, runStatus } from '../lib/install-flow.mjs'

const USAGE = `Usage:
  node <deploy folder>/releases/<release name>/scripts/ops/install.mjs [--prepare-only] [--keep <n>] [--dry-run]
  node <deploy folder>/current/scripts/ops/install.mjs --rollback [--dry-run]
  node <deploy folder>/current/scripts/ops/install.mjs --status

Options:
  --prepare-only   check the release and install its packages, then stop (the first install of a deployment)
  --keep <n>       releases to keep on the server (default ${DEFAULT_KEEP}, at least 2)
  --dry-run        check the release and print every step; run and change nothing
  --rollback       go back to the previous release
  --status         show the releases and the health`

/** Runs one program here. @param {string[]} argv @param {{ cwd?: string, timeoutMs?: number }} [options] */
function run(argv, { cwd, timeoutMs = 15 * 60 * 1000 } = {}) {
  const result = spawnSync(argv[0] ?? '', argv.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  })
  const code = result.error ? (result.error.code === 'ETIMEDOUT' ? 124 : 127) : (result.status ?? 1)
  return { code, stdout: result.stdout ?? '', stderr: result.stderr || (result.error ? result.error.message : '') }
}

/** Takes the lock: true when this call created the folder, false when it already existed. @param {string} path */
function makeLock(path) {
  try {
    mkdirSync(path)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') return false
    throw error
  }
}

/** @param {string} releaseDir */
function readBuildInfo(releaseDir) {
  try {
    return JSON.parse(readFileSync(join(releaseDir, 'dist', 'build-info.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Copies this release's open-package.mjs to the deploy folder when the copy there is missing or different.
 * @param {string} releaseDir @param {string} root
 * @returns {'added' | 'updated' | 'same' | 'no-source'}
 */
function refreshOpener(releaseDir, root) {
  const source = join(releaseDir, 'scripts', 'ops', 'open-package.mjs')
  const target = join(root, 'open-package.mjs')
  if (!existsSync(source)) return 'no-source'
  const wanted = readFileSync(source)
  const present = existsSync(target)
  if (present && readFileSync(target).equals(wanted)) return 'same'
  const temporary = `${target}.tmp`
  writeFileSync(temporary, wanted)
  renameSync(temporary, target)
  return present ? 'updated' : 'added'
}

/** @param {string[]} argv @returns {number} the exit code */
function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        'prepare-only': { type: 'boolean' },
        keep: { type: 'string' },
        'dry-run': { type: 'boolean' },
        rollback: { type: 'boolean' },
        status: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    return 2
  }
  const { values } = parsed
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  const keep = values.keep === undefined ? DEFAULT_KEEP : Number(values.keep)
  const modes = [values.rollback, values.status].filter(Boolean).length
  if (
    modes > 1 ||
    !Number.isInteger(keep) ||
    keep < 2 ||
    (modes === 1 && (values['prepare-only'] || values.keep !== undefined))
  ) {
    console.error(USAGE)
    return 2
  }
  if (values.status && values['dry-run']) {
    console.error(USAGE)
    return 2
  }

  const { place, message } = locateRelease(resolve(import.meta.dirname, '..', '..'))
  if (!place) {
    console.error(`install: ${message}`)
    return 1
  }
  const deps = {
    now: () => new Date(),
    log: (/** @type {string} */ line) => console.log(line),
    run,
    exists: existsSync,
    makeLock,
    removeLock: (/** @type {string} */ path) => rmSync(path, { recursive: true, force: true }),
    readBuildInfo,
    refreshOpener,
    nodePath: process.execPath,
    npmPath: 'npm',
  }
  const dryRun = values['dry-run'] === true
  const result = values.status
    ? runStatus({ place, deps })
    : values.rollback
      ? runRollback({ place, options: { dryRun }, deps })
      : runInstall({ place, options: { dryRun, prepareOnly: values['prepare-only'] === true, keep }, deps })
  return result.ok ? 0 : 1
}

process.exitCode = main(process.argv.slice(2))
