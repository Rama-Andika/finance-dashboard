// The release tool of one deployment folder: make a release the current one, go back to the previous one, remove old
// ones, list them, and check that the server is ready. Plain Node, no dependencies, so it runs on a server that only has
// Node. It works on one folder on disk and knows nothing about SSH; scripts/ops/install.mjs calls it.
//
//   node scripts/ops/release.mjs <command> --root <deploy folder> [options]
//
// Exit code: 0 done, 1 could not do it (the message starts with "release:"), 2 wrong use.
import { spawnSync } from 'node:child_process'
import { existsSync, statfsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { ENV_FILE_NAME } from '../lib/release-layout.mjs'
import {
  activate,
  cleanup,
  linkedRelease,
  listReleases,
  readVersion,
  releasesDir,
  rollback,
} from '../lib/release-store.mjs'

const USAGE = `Usage: node scripts/ops/release.mjs <command> --root <deploy folder> [options]

Commands:
  doctor                              check that this server is ready for a deploy
  activate --release <name>           make a release the current one (the old one becomes "previous")
  rollback                            make the previous release the current one again
  cleanup [--keep <n>] [--dry-run]    remove old releases (default: keep 5; never current or previous)
  list [--json]                       show the releases and which one is current and previous`

const MIN_FREE_BYTES = 1024 ** 3

/** True when the program starts and ends with exit code 0. @param {string} command @param {string[]} args */
function toolWorks(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' })
  return result.status === 0
}

/** @param {string} root @returns {number} */
function doctor(root) {
  /** @type {{ ok: boolean, label: string }[]} */
  const checks = []
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  checks.push({
    ok: major > 22 || (major === 22 && minor >= 12),
    label: `node ${process.versions.node} (22.12 or newer is required)`,
  })
  const folderExists = existsSync(root) && statSync(root).isDirectory()
  checks.push({ ok: folderExists, label: `the deploy folder exists` })
  if (folderExists) {
    const envFile = join(root, ENV_FILE_NAME)
    const envExists = existsSync(envFile)
    checks.push({ ok: envExists, label: `${ENV_FILE_NAME} exists next to releases/` })
    // The mode only means something on Linux and macOS.
    if (envExists && process.platform !== 'win32') {
      checks.push({
        ok: (statSync(envFile).mode & 0o077) === 0,
        label: `${ENV_FILE_NAME} can be read by its owner only (mode 600)`,
      })
    }
    const stats = statfsSync(root)
    const free = Number(stats.bavail) * Number(stats.bsize)
    checks.push({
      ok: free >= MIN_FREE_BYTES,
      label: `at least 1 GiB of free disk space (${Math.floor(free / 1024 ** 3)} GiB free)`,
    })
  }
  checks.push({ ok: toolWorks('tar', ['--version']), label: 'tar can be run' })
  checks.push({ ok: toolWorks('npm', ['--version']), label: 'npm can be run' })
  for (const check of checks) console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.label}`)
  return checks.every((check) => check.ok) ? 0 : 1
}

/** @param {string[]} argv @returns {number} the exit code */
function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        root: { type: 'string' },
        release: { type: 'string' },
        keep: { type: 'string' },
        'dry-run': { type: 'boolean' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    return 2
  }
  const { values, positionals } = parsed
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  const [command] = positionals
  if (positionals.length !== 1 || !values.root) {
    console.error(USAGE)
    return 2
  }
  const root = resolve(values.root)

  try {
    switch (command) {
      case 'doctor':
        return doctor(root)
      case 'activate': {
        if (!values.release) break
        const result = activate(root, values.release)
        console.log(result.changed ? `activated ${result.name}` : `already current ${result.name}`)
        console.log(`previous ${result.previous ?? 'none'}`)
        return 0
      }
      case 'rollback': {
        const result = rollback(root)
        console.log(`rolled back to ${result.name}`)
        console.log(`from ${result.from ?? 'none'}`)
        return 0
      }
      case 'cleanup': {
        const keep = values.keep === undefined ? 5 : Number(values.keep)
        const dryRun = values['dry-run'] === true
        const result = cleanup(root, keep, dryRun)
        const verb = dryRun ? 'would remove' : 'removed'
        for (const name of result.releases) console.log(`${verb} release ${name}`)
        for (const name of result.leftovers) console.log(`${verb} leftover ${name}`)
        console.log(
          `${result.releases.length} release(s) and ${result.leftovers.length} leftover(s) ${dryRun ? 'to remove' : 'removed'}`,
        )
        return 0
      }
      case 'list': {
        const releases = existsSync(releasesDir(root))
          ? listReleases(root).map((name) => ({ name, version: readVersion(root, name) }))
          : []
        const current = linkedRelease(root, 'current')
        const previous = linkedRelease(root, 'previous')
        if (values.json) {
          console.log(JSON.stringify({ current, previous, releases }))
        } else {
          console.log(`Releases in ${root} (newest first):`)
          for (const { name, version } of releases) {
            const mark = name === current ? 'current' : name === previous ? 'previous' : ''
            console.log(`  ${name}  version ${version || 'unknown'}  ${mark}`.trimEnd())
          }
          if (releases.length === 0) console.log('  (none)')
        }
        return 0
      }
      default:
        console.error(USAGE)
        return 2
    }
  } catch (error) {
    console.error(`release: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  console.error(USAGE)
  return 2
}

process.exitCode = main(process.argv.slice(2))
