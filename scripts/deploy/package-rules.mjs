/**
 * What is wrong with the version of a package; an empty list when it is fine.
 * @param {{
 *   env: 'staging' | 'production',
 *   buildVersion: string,
 *   treeDirty: boolean,
 *   allowDirty: boolean,
 * }} input
 *   buildVersion: the version of the build ("git describe --tags --always --dirty"); treeDirty: tracked files have uncommitted
 *   changes; allowDirty: the person accepts that (staging only).
 * @returns {string[]}
 */
export function versionProblems({ env, buildVersion, treeDirty, allowDirty }) {
  /** @type {string[]} */
  const problems = []
  const dirtyAllowed = env === 'staging' && allowDirty
  if (!dirtyAllowed && (treeDirty || buildVersion.endsWith('-dirty'))) {
    problems.push('there are uncommitted changes to tracked files; commit or stash them first')
  }
  if (buildVersion === 'unknown') problems.push('the build has no version (is this a git folder?)')
  return problems
}
