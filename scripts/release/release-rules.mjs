import { RC_TAG_PATTERN, STABLE_TAG_PATTERN } from '../lib/version-rules.mjs'

/**
 * The decisions of the release script that need no git and no disk: which tags count, what a commit says, which version
 * comes next, which lane a release takes, and what a notes file must contain. Everything here is a pure function.
 * @typedef {{ major: number, minor: number, patch: number }} Semver
 * @typedef {{ subject: string, body: string }} RawCommit
 * @typedef {{ subject: string, type: string, scope: string, breaking: boolean, formulaChange: boolean, conventional: boolean }} Commit
 * @typedef {'patch' | 'minor' | 'major'} Level
 * @typedef {'first' | 'fast' | 'full'} Lane
 */

/** The commit types the project allows. "chore" is there because the release commit itself is "chore(release): ...". */
export const COMMIT_TYPES = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'style',
  'test',
  'chore',
  'build',
  'ci',
  'revert',
]

const COMMIT_SUBJECT = new RegExp(`^(${COMMIT_TYPES.join('|')})(?:\\(([^)\\r\\n]+)\\))?(!)?: \\S`)
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: \S/m
const FORMULA_FOOTER = /^Formula-Change: \S/m

/** Files and folders that may differ between the last rc tag and the stable release commit. */
export const RC_TO_STABLE_ALLOWED = ['package.json', 'package-lock.json', 'CHANGELOG.md']
export const RC_TO_STABLE_ALLOWED_PREFIX = 'docs/releases/'

/** @param {string} tag @returns {Semver | null} */
export function parseStableTag(tag) {
  const match = STABLE_TAG_PATTERN.exec(tag)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/** @param {Semver} a @param {Semver} b @returns {number} negative when a is older */
export function compareSemver(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

/** @param {Semver} v */
export function formatTag(v) {
  return `v${v.major}.${v.minor}.${v.patch}`
}

/**
 * The newest stable tag. Sorted by the numbers, never by the order git lists them or by date.
 * @param {string[]} tags
 * @returns {string | null}
 */
export function latestStableTag(tags) {
  let best = null
  for (const tag of tags) {
    const parsed = parseStableTag(tag)
    if (parsed && (best === null || compareSemver(parsed, best.parsed) > 0)) best = { tag, parsed }
  }
  return best ? best.tag : null
}

/**
 * The number of the next release candidate of a version: one more than the highest vX.Y.Z-rc.N tag, or 1.
 * @param {string[]} tags @param {string} stableTag for example "v1.4.0"
 */
export function nextRcNumber(tags, stableTag) {
  let highest = 0
  for (const tag of tags) {
    const match = RC_TAG_PATTERN.exec(tag)
    if (match && `v${match[1]}.${match[2]}.${match[3]}` === stableTag) highest = Math.max(highest, Number(match[4]))
  }
  return highest + 1
}

/**
 * The newest release candidate tag of a version, or null.
 * @param {string[]} tags @param {string} stableTag
 */
export function latestRcTag(tags, stableTag) {
  const n = nextRcNumber(tags, stableTag) - 1
  return n === 0 ? null : `${stableTag}-rc.${n}`
}

/** @param {RawCommit} raw @returns {Commit} */
export function parseCommit({ subject, body }) {
  const match = COMMIT_SUBJECT.exec(subject)
  return {
    subject,
    type: match?.[1] ?? '',
    scope: match?.[2] ?? '',
    breaking: Boolean(match?.[3]) || BREAKING_FOOTER.test(body),
    formulaChange: FORMULA_FOOTER.test(body),
    conventional: match !== null,
  }
}

/**
 * The subjects of the commits that do not follow "type(scope): text". The release stops when there are any.
 * @param {Commit[]} commits
 */
export function conventionProblems(commits) {
  return commits.filter((c) => !c.conventional).map((c) => c.subject)
}

/**
 * The bump the commits ask for. major: a breaking commit ("type!:" or a BREAKING CHANGE footer); minor: a feat commit or
 * a commit with a Formula-Change footer; patch: anything else.
 * @param {Commit[]} commits
 * @returns {{ level: Level, breaking: Commit[], formula: Commit[], features: Commit[], fixes: Commit[] }}
 */
export function levelOf(commits) {
  const breaking = commits.filter((c) => c.breaking)
  const formula = commits.filter((c) => c.formulaChange)
  const features = commits.filter((c) => c.type === 'feat')
  const fixes = commits.filter((c) => c.type === 'fix' || c.type === 'perf')
  const level = breaking.length > 0 ? 'major' : features.length > 0 || formula.length > 0 ? 'minor' : 'patch'
  return { level, breaking, formula, features, fixes }
}

/**
 * The next version after a bump. While the major number is 0, a major-level change bumps the minor number (the SemVer
 * convention for 0.x); `flaggedMajor` tells the notes and the screen that it was major-level anyway.
 * @param {Semver} from @param {Level} level
 * @returns {{ next: Semver, flaggedMajor: boolean }}
 */
export function applyLevel(from, level) {
  if (level === 'patch') return { next: { ...from, patch: from.patch + 1 }, flaggedMajor: false }
  if (level === 'minor') return { next: { major: from.major, minor: from.minor + 1, patch: 0 }, flaggedMajor: false }
  if (from.major === 0) return { next: { major: 0, minor: from.minor + 1, patch: 0 }, flaggedMajor: true }
  return { next: { major: from.major + 1, minor: 0, patch: 0 }, flaggedMajor: true }
}

/**
 * Which lane a release takes. first: nothing was released before; fast: only the patch number grows; full: the minor or
 * the major number grows.
 * @param {Semver | null} last @param {Semver} next @returns {Lane}
 */
export function laneOf(last, next) {
  if (last === null) return 'first'
  return last.major === next.major && last.minor === next.minor ? 'fast' : 'full'
}

/**
 * Turns what the owner typed (or passed as --bump) into a version.
 * @param {string} text "patch", "minor" or an exact version "1.0.0" (a leading "v" is accepted)
 * @param {Semver | null} last
 * @returns {{ ok: true, next: Semver } | { ok: false, problem: string }}
 */
export function parseOverride(text, last) {
  const answer = text.trim()
  const base = last ?? { major: 0, minor: 0, patch: 0 }
  if (answer === 'patch') return { ok: true, next: applyLevel(base, 'patch').next }
  if (answer === 'minor') return { ok: true, next: applyLevel(base, 'minor').next }
  const parsed = parseStableTag(answer.startsWith('v') ? answer : `v${answer}`)
  if (!parsed) return { ok: false, problem: `"${answer}" is not patch, minor or a version like 1.0.0` }
  if (last !== null && compareSemver(parsed, last) <= 0) {
    return { ok: false, problem: `${formatTag(parsed)} is not newer than the last release ${formatTag(last)}` }
  }
  return { ok: true, next: parsed }
}

/**
 * The files changed between the last rc tag and the stable release commit that a stable release may not contain.
 * @param {string[]} changedFiles paths as git prints them (forward slashes)
 */
export function rcDiffProblems(changedFiles) {
  return changedFiles.filter(
    (file) => !RC_TO_STABLE_ALLOWED.includes(file) && !file.startsWith(RC_TO_STABLE_ALLOWED_PREFIX),
  )
}

/** The text a new notes file starts with in the section that finance must fill. */
export const NOTES_PLACEHOLDER = 'TODO'

/**
 * The text of a "## " section of a notes file without comments and blank lines; null when the section does not exist.
 * @param {string} text @param {string} heading for example "Perubahan angka"
 * @returns {string | null}
 */
export function notesSection(text, heading) {
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (start === -1) return null
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break
    if (line.trim() !== '') body.push(line.trim())
  }
  return body.join('\n')
}

/**
 * What is wrong with a notes file; an empty list when it is fine. "Perubahan angka" must say something and must not
 * still hold the TODO placeholder; when the release has a breaking commit, "Tindakan operator" must too.
 * @param {string} text @param {{ needsOperatorSection: boolean }} options
 */
export function notesProblems(text, { needsOperatorSection }) {
  /** @type {string[]} */
  const problems = []
  const headings = ['Perubahan angka', ...(needsOperatorSection ? ['Tindakan operator'] : [])]
  for (const heading of headings) {
    const section = notesSection(text, heading)
    if (section === null) problems.push(`the section "## ${heading}" is missing`)
    else if (section === '') problems.push(`the section "## ${heading}" is empty`)
    else if (section.includes(NOTES_PLACEHOLDER))
      problems.push(`the section "## ${heading}" still has the ${NOTES_PLACEHOLDER} placeholder`)
  }
  return problems
}
