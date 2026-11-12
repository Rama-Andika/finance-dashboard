// Builds the application for one client and environment, checks the build, and makes the package (.tgz) to upload to a
// server by hand. It never connects to a server. Run from the project folder on the build computer:
//   npm run release:pack -- <client> <staging|production> [--skip-build] [--allow-dirty] [--out <folder>]
// See docs/project-guide.md chapter 10.9. This file only connects the real world (git, the builds, the files) to the flow
// in package-flow.mjs, where every decision is made and tested.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { CLIENT_ID_PATTERN } from '../lib/env-rules.mjs'
import { scanBundle } from './bundle-imports.mjs'
import { runPackage } from './package-flow.mjs'
import { packageRelease } from './package-release.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const DEFAULT_OUT = 'release-packages'

const USAGE = `Usage: npm run release:pack -- <client> <staging|production> [--skip-build] [--allow-dirty] [--out <folder>]

  <client>         the client name as used in the deploy folder name, for example acme
  --skip-build     use the dist/ that exists; it must match this commit and this client
  --allow-dirty    staging only: package with uncommitted changes
  --out <folder>   where to put the package (default ${DEFAULT_OUT}/, ignored by git)`

/** The output of git in the project folder; throws when git fails. @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

const realGit = {
  describe() {
    try {
      return git(['describe', '--tags', '--always', '--dirty']) || 'unknown'
    } catch {
      return 'unknown'
    }
  },
  isDirty() {
    try {
      return git(['status', '--porcelain', '--untracked-files=no']) !== ''
    } catch {
      return true
    }
  },
}

/** Both builds, in this order: the first one empties dist/, the second one writes dist/ops/. @param {string} clientId */
function build(clientId) {
  const options = { cwd: root, stdio: 'inherit' }
  const app = spawnSync(process.execPath, [join(root, 'scripts', 'build-client.mjs'), clientId], options)
  if (app.status !== 0) return false
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  return spawnSync(process.execPath, [viteBin, 'build', '--config', 'vite.ops.config.ts'], options).status === 0
}

function readBuildInfo() {
  try {
    return JSON.parse(readFileSync(join(root, 'dist', 'build-info.json'), 'utf8'))
  } catch {
    return null
  }
}

/** @param {string[]} argv @returns {number} the exit code */
function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'skip-build': { type: 'boolean' },
        'allow-dirty': { type: 'boolean' },
        out: { type: 'string' },
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
  const [client = '', env = ''] = positionals
  if (positionals.length !== 2 || !CLIENT_ID_PATTERN.test(client) || (env !== 'staging' && env !== 'production')) {
    console.error(USAGE)
    return 2
  }

  const outDir = resolve(root, values.out ?? DEFAULT_OUT)
  const deps = {
    now: () => new Date(),
    log: (/** @type {string} */ line) => console.log(line),
    git: realGit,
    build,
    readBuildInfo,
    scanBundle: () => scanBundle(join(root, 'dist'), readFileSync(join(root, 'package-lock.json'), 'utf8')),
    makePackage: (/** @type {string} */ name) => {
      const workDir = mkdtempSync(join(tmpdir(), 'oxy-package-'))
      try {
        const { archive, sizeBytes } = packageRelease({ root, workDir, name })
        mkdirSync(outDir, { recursive: true })
        const file = join(outDir, `${name}.tgz`)
        copyFileSync(archive, file)
        // The helper that opens a package on the server, next to the package: it is uploaded once per deployment.
        const helper = join(outDir, 'open-package.mjs')
        copyFileSync(join(root, 'scripts', 'ops', 'open-package.mjs'), helper)
        return { file, helper, sizeBytes }
      } finally {
        rmSync(workDir, { recursive: true, force: true })
      }
    },
  }
  return runPackage({
    client,
    env,
    options: { skipBuild: values['skip-build'], allowDirty: values['allow-dirty'] },
    deps,
  }).ok
    ? 0
    : 1
}

process.exitCode = main(process.argv.slice(2))
