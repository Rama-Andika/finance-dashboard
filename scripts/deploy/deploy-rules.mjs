import { RELEASE_TAG_PATTERN } from '../lib/release-layout.mjs'

/** The one deploy window for production, on the clock of the client: from 22:00 up to (not including) 05:00. */
export const DEPLOY_WINDOW = { start: '22:00', end: '05:00' }

/** "HH:MM" as minutes after midnight. @param {string} clock */
function toMinutes(clock) {
  const [hours = 0, minutes = 0] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Minutes after midnight of `now` on the wall clock of a time zone.
 * @param {Date} now
 * @param {string} timeZone for example Asia/Jakarta
 */
export function localMinutes(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hours = Number(parts.find((part) => part.type === 'hour')?.value)
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value)
  return hours * 60 + minutes
}

/**
 * True when `now` is inside the window on the clock of the time zone. The start counts, the end does not, and a window
 * that runs past midnight (start later than end) is handled.
 * @param {Date} now
 * @param {string} timeZone
 * @param {{ start: string, end: string }} [window]
 */
export function isInsideDeployWindow(now, timeZone, window = DEPLOY_WINDOW) {
  const minute = localMinutes(now, timeZone)
  const start = toMinutes(window.start)
  const end = toMinutes(window.end)
  return start > end ? minute >= start || minute < end : minute >= start && minute < end
}

/** @param {string} timeZone @param {{ start: string, end: string }} [window] */
export function describeWindow(timeZone, window = DEPLOY_WINDOW) {
  return `${window.start} to ${window.end} (${timeZone})`
}

/**
 * What is wrong with the version of this deploy; an empty list when it is fine.
 * @param {{
 *   env: 'staging' | 'production',
 *   buildVersion: string,
 *   exactTag: string | null,
 *   treeDirty: boolean,
 *   allowDirty: boolean,
 * }} input
 *   buildVersion: the version of the build ("git describe --tags --always --dirty"); exactTag: the tag that points exactly
 *   at this commit, or null; treeDirty: tracked files have uncommitted changes; allowDirty: the person accepts that (staging only).
 * @returns {string[]}
 */
export function versionProblems({ env, buildVersion, exactTag, treeDirty, allowDirty }) {
  /** @type {string[]} */
  const problems = []
  const dirtyAllowed = env === 'staging' && allowDirty
  if (!dirtyAllowed && (treeDirty || buildVersion.endsWith('-dirty'))) {
    problems.push('there are uncommitted changes to tracked files; commit or stash them first')
  }
  if (buildVersion === 'unknown') problems.push('the build has no version (is this a git folder?)')
  if (env === 'production') {
    if (exactTag === null || !RELEASE_TAG_PATTERN.test(exactTag)) {
      problems.push('production is released from a tag vMAJOR.MINOR.PATCH on the current commit (git tag v1.2.3)')
    } else if (buildVersion !== exactTag && !buildVersion.endsWith('-dirty')) {
      problems.push(`the build version (${buildVersion}) is not the tag of this commit (${exactTag})`)
    }
  }
  return problems
}
