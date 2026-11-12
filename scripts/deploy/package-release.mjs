import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** What goes into a release, relative to the project root. */
export const PAYLOAD = [
  'dist',
  'drizzle-dash',
  'scripts/lib',
  'scripts/ops',
  'scripts/start-server.mjs',
  'package.json',
  'package-lock.json',
]

/** Files that must exist before packaging, or the release would not start or could not be deployed. */
export const PAYLOAD_REQUIRED_FILES = [
  'dist/base-path.json',
  'dist/build-info.json',
  'dist/server/server-entry.js',
  'dist/ops/dash-migrate.mjs',
  'dist/ops/logs-find.mjs',
  'drizzle-dash/meta/_journal.json',
  'scripts/start-server.mjs',
  'scripts/ops/release.mjs',
  'scripts/ops/health-check.mjs',
  'scripts/ops/env-check.mjs',
  'scripts/ops/init-env.mjs',
  'scripts/ops/install.mjs',
  'scripts/ops/open-package.mjs',
  'scripts/lib/install-flow.mjs',
  'package.json',
  'package-lock.json',
]

/** @param {string} path */
const isTestFile = (path) => /\.test\.(mjs|ts)$/.test(path)

/**
 * The required files that do not exist in the project folder.
 * @param {string} root
 * @returns {string[]}
 */
export function missingPayloadFiles(root) {
  return PAYLOAD_REQUIRED_FILES.filter((file) => !existsSync(join(root, ...file.split('/'))))
}

/**
 * Copies the payload to workDir/stage and makes workDir/<name>.tgz from it.
 * @param {{ root: string, workDir: string, name: string }} input
 *   root: the project folder (after the builds); workDir: an empty folder for the stage and the archive; name: the release name
 * @returns {{ archive: string, sizeBytes: number }}
 */
export function packageRelease({ root, workDir, name }) {
  const missing = missingPayloadFiles(root)
  if (missing.length > 0) throw new Error(`cannot package: missing ${missing.join(', ')} (did both builds finish?)`)
  const stage = join(workDir, 'stage')
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  for (const item of PAYLOAD) {
    cpSync(join(root, ...item.split('/')), join(stage, ...item.split('/')), {
      recursive: true,
      filter: (source) => !isTestFile(source),
    })
  }
  const archiveName = `${name}.tgz`
  const made = spawnSync('tar', ['-czf', archiveName, '-C', 'stage', '.'], { cwd: workDir, encoding: 'utf8' })
  if (made.status !== 0)
    throw new Error(`tar could not make the archive: ${(made.stderr || made.error?.message || '').trim()}`)
  const archive = join(workDir, archiveName)
  return { archive, sizeBytes: statSync(archive).size }
}
