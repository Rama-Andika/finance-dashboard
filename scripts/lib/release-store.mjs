import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { RELEASE_NAME_PATTERN, REQUIRED_RELEASE_FILES } from './release-layout.mjs'

const IS_WINDOWS = process.platform === 'win32'

/** The folder that holds the releases of a deployment. @param {string} root */
export function releasesDir(root) {
  return join(root, 'releases')
}

/**
 * Names of the releases, newest first. The time stamp leads the name, so sorting the names sorts the time.
 * Hidden folders (.incoming, .tmp-*) and anything that is not a release name are left out.
 * @param {string} root
 * @returns {string[]}
 */
export function listReleases(root) {
  const dir = releasesDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && RELEASE_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse()
}

/**
 * The release a link ("current" or "previous") points to; null when the link does not exist or is not a link.
 * @param {string} root
 * @param {'current' | 'previous'} linkName
 * @returns {string | null}
 */
export function linkedRelease(root, linkName) {
  const link = join(root, linkName)
  try {
    if (!lstatSync(link).isSymbolicLink()) return null
  } catch {
    return null
  }
  const name = basename(readlinkSync(link).replace(/[\\/]+$/, ''))
  return RELEASE_NAME_PATTERN.test(name) ? name : null
}

/**
 * The files of the release that are missing (empty when it is complete).
 * @param {string} root
 * @param {string} name
 * @returns {string[]}
 */
export function missingFiles(root, name) {
  const dir = join(releasesDir(root), name)
  return REQUIRED_RELEASE_FILES.filter((file) => !existsSync(join(dir, ...file.split('/'))))
}

/** The version a release was built as (dist/build-info.json); an empty text when it cannot be read. */
export function readVersion(root, name) {
  try {
    const file = join(releasesDir(root), name, 'dist', 'build-info.json')
    return String(JSON.parse(readFileSync(file, 'utf8')).version ?? '')
  } catch {
    return ''
  }
}

/** Points the link at a release. On Linux the new link replaces the old one in a single rename. */
function pointTo(root, linkName, name) {
  const link = join(root, linkName)
  const temp = `${link}.new`
  rmSync(temp, { force: true })
  // A relative target on Linux (the folder can be moved); Windows junctions need an absolute one.
  const target = IS_WINDOWS ? join(releasesDir(root), name) : join('releases', name)
  symlinkSync(target, temp, IS_WINDOWS ? 'junction' : 'dir')
  if (IS_WINDOWS) rmSync(link, { force: true }) // Windows cannot rename over an existing link
  renameSync(temp, link)
}

/**
 * Makes a release the current one; the one that was current becomes "previous".
 * @param {string} root
 * @param {string} name
 * @returns {{ name: string, previous: string | null, changed: boolean }}
 */
export function activate(root, name) {
  if (!RELEASE_NAME_PATTERN.test(name)) throw new Error(`"${name}" is not a release name`)
  if (!existsSync(join(releasesDir(root), name))) throw new Error(`release ${name} does not exist`)
  const missing = missingFiles(root, name)
  if (missing.length > 0) throw new Error(`release ${name} is incomplete: missing ${missing.join(', ')}`)
  const before = linkedRelease(root, 'current')
  if (before === name) return { name, previous: linkedRelease(root, 'previous'), changed: false }
  if (before !== null) pointTo(root, 'previous', before)
  pointTo(root, 'current', name)
  return { name, previous: before, changed: true }
}

/**
 * Makes the previous release the current one again; the release that was current becomes "previous".
 * @param {string} root
 * @returns {{ name: string, from: string | null }}
 */
export function rollback(root) {
  const current = linkedRelease(root, 'current')
  const previous = linkedRelease(root, 'previous')
  if (previous === null) throw new Error('there is no previous release to go back to')
  const missing = existsSync(join(releasesDir(root), previous)) ? missingFiles(root, previous) : ['the whole folder']
  if (missing.length > 0)
    throw new Error(`the previous release ${previous} is gone or incomplete: missing ${missing.join(', ')}`)
  pointTo(root, 'current', previous)
  if (current !== null) pointTo(root, 'previous', current)
  return { name: previous, from: current }
}

/**
 * Removes old releases: the newest `keep` stay, and so do the current and the previous release.
 * Also removes leftovers of failed deploys (.tmp-* folders and files in .incoming).
 * @param {string} root
 * @param {number} keep how many of the newest releases to keep (at least 2)
 * @param {boolean} [dryRun] only report
 * @returns {{ releases: string[], leftovers: string[] }} what was (or, with dryRun, would be) removed
 */
export function cleanup(root, keep, dryRun = false) {
  if (!Number.isInteger(keep) || keep < 2) throw new Error('keep must be a whole number of at least 2')
  const all = listReleases(root)
  const kept = new Set(all.slice(0, keep))
  for (const link of /** @type {const} */ (['current', 'previous'])) {
    const name = linkedRelease(root, link)
    if (name !== null) kept.add(name)
  }
  const releases = all.filter((name) => !kept.has(name))

  const dir = releasesDir(root)
  /** @type {string[]} */
  const leftovers = []
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.tmp-')) leftovers.push(entry.name)
    }
    const incoming = join(dir, '.incoming')
    if (existsSync(incoming)) for (const file of readdirSync(incoming)) leftovers.push(join('.incoming', file))
  }

  if (!dryRun) {
    for (const name of releases) rmSync(join(dir, name), { recursive: true, force: true })
    for (const leftover of leftovers) rmSync(join(dir, leftover), { recursive: true, force: true })
  }
  return { releases, leftovers }
}
