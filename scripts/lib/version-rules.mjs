/**
 * What a version text may look like. A release tag is "v" and three numbers; a release candidate adds "-rc." and a number
 * that starts at 1. Everything else that "git describe --tags --always --dirty" can print (a commit id, "v1.2.0-3-g1a2b3c4",
 * a text ending in "-dirty") is not a release. No dependencies: the release script, the package builder and the installer
 * on the server all load this file.
 */
export const STABLE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const RC_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.([1-9]\d*)$/

/** @param {string} version */
export function isStableTag(version) {
  return STABLE_TAG_PATTERN.test(version)
}

/** @param {string} version */
export function isRcTag(version) {
  return RC_TAG_PATTERN.test(version)
}

/**
 * Why a version may not be installed in an environment; an empty text when it may.
 * production needs a stable tag; staging needs a stable tag or a release candidate tag.
 * @param {string} version the version of the build (dist/build-info.json)
 * @param {'staging' | 'production'} env
 * @returns {string}
 */
export function installVersionProblem(version, env) {
  if (env === 'production') {
    return isStableTag(version)
      ? ''
      : `the version "${version}" cannot go to production: production needs an exact stable tag such as v1.4.0 (not a release candidate, not a commit id, not a build with extra commits or changes)`
  }
  return isStableTag(version) || isRcTag(version)
    ? ''
    : `the version "${version}" cannot go to staging: staging needs an exact tag such as v1.4.0 or v1.4.0-rc.1 (not a commit id, not a build with extra commits or changes)`
}
