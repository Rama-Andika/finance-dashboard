// Opens a release package (.tgz made by "npm run release:pack") into <deploy folder>/releases/<release name>/ and runs the
// installer of that release. The release name is the file name without ".tgz", so nobody has to type it. One self-contained
// file with no imports from this project: the first time it is copied to a deploy folder by hand (the package, which holds
// the installer, cannot be opened without it). See docs/project-guide.md chapter 10.9.
//
//   node <deploy folder>/open-package.mjs <package>.tgz [--prepare-only] [--dry-run] [--keep <n>]
//
// The deploy folder is the folder this file sits in (oxy-<client>-<env>-finance-dashboard-<port>), so it is not typed either.
// Opening is safe to repeat: a release that is already open and complete is installed again without opening it again.
// Exit code: the one of the installer, 1 when the package could not be opened, 2 wrong use.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Small copies of the rules in scripts/lib/release-layout.mjs and scripts/lib/env-rules.mjs (this file cannot import them;
// scripts/ops/open-package.test.mjs fails when the copies differ).
export const RELEASE_NAME_PATTERN = /^\d{14}-[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
export const DEPLOY_FOLDER_PATTERN = /^oxy-([a-z0-9][a-z0-9-]*)-(staging|production)-finance-dashboard-(\d{2,5})$/
/** What a release must contain before it is installed. */
export const REQUIRED_FILES = [
  'package.json',
  'dist/base-path.json',
  'dist/build-info.json',
  'scripts/start-server.mjs',
  'scripts/ops/install.mjs',
]
/** The only options passed on to the installer. */
const PASSED_ON = ['--prepare-only', '--dry-run', '--keep']

const USAGE = `Usage: node <deploy folder>/open-package.mjs <package>.tgz [--prepare-only] [--dry-run] [--keep <n>]

  <package>.tgz    the file made by "npm run release:pack"; its name (without .tgz) is the name of the release
  --prepare-only   open and install the packages only, for the first install of a deployment
  --dry-run        show the steps of the installer without changing anything (the package is still opened)
  --keep <n>       releases to keep on the server`

/**
 * The release name a package file gives: its name without ".tgz". Null when the file name is not one that release:pack made.
 * @param {string} file
 * @returns {string | null}
 */
export function releaseNameOf(file) {
  const name = basename(file)
  if (!name.endsWith('.tgz')) return null
  const release = name.slice(0, -'.tgz'.length)
  return RELEASE_NAME_PATTERN.test(release) ? release : null
}

/**
 * The deploy folder for the folder this script sits in: that folder itself, or (when the copy inside a release is run) the
 * folder above releases/. The folder must be named oxy-<client>-<env>-finance-dashboard-<port>.
 * @param {string} scriptDir the folder of this file
 * @returns {{ root: string | null, message: string }}
 */
export function deployFolderOf(scriptDir) {
  const insideRelease =
    basename(scriptDir) === 'ops' &&
    basename(dirname(scriptDir)) === 'scripts' &&
    basename(dirname(dirname(dirname(scriptDir)))) === 'releases'
  const root = insideRelease ? dirname(dirname(dirname(dirname(scriptDir)))) : scriptDir
  if (!DEPLOY_FOLDER_PATTERN.test(basename(root))) {
    return {
      root: null,
      message: `this file must sit in the deploy folder, which must be named oxy-<client>-<env>-finance-dashboard-<port> (it is in "${basename(root)}")`,
    }
  }
  return { root, message: '' }
}

/**
 * Splits the arguments: the package file first, then only the options that are passed on to the installer.
 * @param {string[]} argv
 * @returns {{ file: string, passOn: string[] } | null} null for wrong use
 */
export function readArguments(argv) {
  const [file, ...rest] = argv
  if (!file || file.startsWith('-')) return null
  /** @type {string[]} */
  const passOn = []
  for (let i = 0; i < rest.length; i++) {
    const option = rest[i] ?? ''
    if (!PASSED_ON.includes(option)) return null
    passOn.push(option)
    if (option === '--keep') {
      const value = rest[++i]
      if (value === undefined || !/^\d+$/.test(value)) return null
      passOn.push(value)
    }
  }
  return { file, passOn }
}

/** The required files that do not exist in a folder. @param {string} dir */
function missingIn(dir) {
  return REQUIRED_FILES.filter((file) => !existsSync(join(dir, ...file.split('/'))))
}

/** @param {string[]} argv @returns {number} the exit code */
function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  const parsed = readArguments(argv)
  if (!parsed) {
    console.error(USAGE)
    return 2
  }
  const { root, message } = deployFolderOf(dirname(fileURLToPath(import.meta.url)))
  if (root === null) {
    console.error(`open-package: ${message}`)
    return 1
  }
  const file = resolve(parsed.file)
  const name = releaseNameOf(file)
  if (name === null) {
    console.error(
      `open-package: "${basename(file)}" is not a package made by release:pack. Its name must be <14 digits>-<version>.tgz; do not rename the file.`,
    )
    return 1
  }
  if (!existsSync(file)) {
    console.error(`open-package: the file ${file} does not exist`)
    return 1
  }

  const releases = join(root, 'releases')
  const finalDir = join(releases, name)
  if (existsSync(finalDir)) {
    const missing = missingIn(finalDir)
    if (missing.length > 0) {
      console.error(
        `open-package: ${finalDir} exists but is incomplete (missing ${missing.join(', ')}). Remove it with: rm -r ${finalDir}   then run this command again.`,
      )
      return 1
    }
    console.log(`The release ${name} is already open; it is installed again.`)
  } else {
    const tempName = `.tmp-${name}`
    const tempDir = join(releases, tempName)
    mkdirSync(releases, { recursive: true })
    rmSync(tempDir, { recursive: true, force: true })
    mkdirSync(tempDir)
    // The working directory is the releases folder and the paths are relative: a Windows drive letter ("C:") would be read
    // by GNU tar as a host name.
    const opened = spawnSync('tar', ['-xzf', relative(releases, file).split('\\').join('/'), '-C', tempName], {
      cwd: releases,
      encoding: 'utf8',
    })
    const absent = opened.status === 0 ? missingIn(tempDir) : []
    if (opened.status !== 0 || absent.length > 0) {
      rmSync(tempDir, { recursive: true, force: true })
      const reason =
        opened.status !== 0
          ? `tar could not open the package: ${(opened.stderr || opened.error?.message || '').trim()}`
          : `the package is incomplete (missing ${absent.join(', ')})`
      console.error(`open-package: ${reason}`)
      return 1
    }
    renameSync(tempDir, finalDir)
    console.log(`Opened ${basename(file)} into ${finalDir}`)
  }

  const installer = join(finalDir, 'scripts', 'ops', 'install.mjs')
  const result = spawnSync(process.execPath, [installer, ...parsed.passOn], { stdio: 'inherit' })
  if (result.error) {
    console.error(`open-package: the installer could not be started: ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

// Run only when started as a program, not when a test imports the functions above.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
