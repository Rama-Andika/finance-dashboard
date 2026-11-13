import { installVersionProblem } from '../lib/version-rules.mjs'

/** What a person is told when the build has changes that are not committed. */
export const DIRTY_MESSAGE = 'there are uncommitted changes to tracked files; commit or stash them first'

/**
 * What is wrong with the version of a package; an empty list when it is fine.
 * A package for a server needs a clean tree and a build made exactly at a release tag: production a stable tag
 * (v1.4.0), staging a stable tag or a release candidate tag (v1.4.0-rc.1). With localOnly the person asks for a package
 * of any commit, to try out on this computer; it is made, but the installer on a server refuses it (its version is not a tag).
 * @param {{
 *   env: 'staging' | 'production',
 *   buildVersion: string,
 *   treeDirty: boolean,
 *   localOnly: boolean,
 * }} input
 *   buildVersion: the version of the build ("git describe --tags --always --dirty"); treeDirty: tracked files have uncommitted changes.
 * @returns {string[]}
 */
export function versionProblems({ env, buildVersion, treeDirty, localOnly }) {
  /** @type {string[]} */
  const problems = []
  if (buildVersion === 'unknown') problems.push('the build has no version (is this a git folder?)')
  if (localOnly) return problems
  if (treeDirty || buildVersion.endsWith('-dirty')) {
    problems.push(DIRTY_MESSAGE)
  } else if (buildVersion !== 'unknown') {
    const problem = installVersionProblem(buildVersion, env)
    if (problem !== '') problems.push(problem)
  }
  return problems
}
