// Deploys the current commit to one target (one deployment of one client on one server). Run from the project folder on the
// build computer: npm run deploy -- <target> [options]. See docs/project-guide.md chapter 10.9.
// This file only connects the real world (git, the builds, ssh, the terminal) to the flow in deploy-flow.mjs, where every
// decision is made and tested.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { scanBundle } from './bundle-imports.mjs'
import { DEFAULT_KEEP, runDeploy, runRollback, runStatus } from './deploy-flow.mjs'
import { packageRelease } from './package-release.mjs'
import { DEFAULT_TARGETS_FILE, loadTargets } from './targets.mjs'
import { createSshTransport } from './transport.mjs'

const root = resolve(import.meta.dirname, '..', '..')

const USAGE = `Usage:
  npm run deploy -- <target> [--dry-run] [--force-window] [--skip-build] [--allow-dirty] [--prepare-only] [--keep <n>] [--yes]
  npm run deploy -- <target> --rollback [--yes]
  npm run deploy -- <target> --status
  npm run deploy -- --list-targets [--env staging|production]

Options:
  --targets <file>   the list of targets (default: ${DEFAULT_TARGETS_FILE}, or DEPLOY_TARGETS_FILE)
  --dry-run          check the rules and print every step; build, send and change nothing
  --force-window     production outside the deploy window (emergencies only)
  --skip-build       use the dist/ that exists; it must match this commit and this target
  --allow-dirty      staging only: deploy with uncommitted changes
  --prepare-only     upload and install the release, then stop (the first deploy of a new deployment)
  --keep <n>         releases to keep on the server (default ${DEFAULT_KEEP}, at least 2)
  --yes              do not ask for confirmation (production)
  --rollback         go back to the previous release
  --status           show the releases and the health`

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
  exactTag() {
    try {
      return git(['describe', '--tags', '--exact-match', 'HEAD']) || null
    } catch {
      return null
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

/** Asks on the terminal; true only when the typed text equals `expected`. @param {{ question: string, expected: string }} input */
async function confirm({ question, expected }) {
  if (!process.stdin.isTTY) {
    console.error('This needs a terminal to ask for confirmation; run it in a terminal, or add --yes.')
    return false
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await terminal.question(question)).trim() === expected
  } finally {
    terminal.close()
  }
}

/** @param {string[]} argv @returns {Promise<number>} the exit code */
async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        targets: { type: 'string' },
        env: { type: 'string' },
        'list-targets': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        'force-window': { type: 'boolean' },
        'skip-build': { type: 'boolean' },
        'allow-dirty': { type: 'boolean' },
        'prepare-only': { type: 'boolean' },
        keep: { type: 'string' },
        yes: { type: 'boolean' },
        rollback: { type: 'boolean' },
        status: { type: 'boolean' },
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

  const file = resolve(root, values.targets ?? process.env.DEPLOY_TARGETS_FILE ?? DEFAULT_TARGETS_FILE)
  const { targets, problems } = loadTargets(file)

  if (values['list-targets']) {
    if (positionals.length > 0) {
      console.error(USAGE)
      return 2
    }
    if (problems.length > 0) {
      for (const problem of problems) console.error(`targets: ${problem}`)
      return 1
    }
    for (const target of targets) {
      if (values.env && target.env !== values.env) continue
      console.log(`${target.name}  ${target.env}  ${target.ssh}  ${target.root}`)
    }
    return 0
  }

  const [name] = positionals
  const keep = values.keep === undefined ? DEFAULT_KEEP : Number(values.keep)
  const modes = [values.rollback, values.status].filter(Boolean).length
  const buildOptions = values['skip-build'] || values['allow-dirty'] || values['prepare-only'] || values['force-window']
  if (positionals.length !== 1 || !name || modes > 1 || !Number.isInteger(keep) || keep < 2) {
    console.error(USAGE)
    return 2
  }
  if (modes === 1 && buildOptions) {
    console.error(
      '--rollback and --status cannot be combined with --skip-build, --allow-dirty, --prepare-only or --force-window.',
    )
    return 2
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`targets: ${problem}`)
    return 1
  }
  const target = targets.find((candidate) => candidate.name === name)
  if (!target) {
    console.error(
      `There is no target "${name}" in ${file}. Known targets: ${targets.map((candidate) => candidate.name).join(', ')}`,
    )
    return 2
  }

  const workDir = mkdtempSync(join(tmpdir(), 'oxy-deploy-'))
  const deps = {
    now: () => new Date(),
    log: (/** @type {string} */ line) => console.log(line),
    git: realGit,
    build,
    readBuildInfo,
    scanBundle: () => scanBundle(join(root, 'dist'), readFileSync(join(root, 'package-lock.json'), 'utf8')),
    packageRelease: (/** @type {string} */ releaseName) => ({
      ...packageRelease({ root, workDir, name: releaseName }),
      dispose: () => rmSync(workDir, { recursive: true, force: true }),
    }),
    transport: createSshTransport(target),
    confirm,
  }
  try {
    const result = values.status
      ? await runStatus({ target, deps })
      : values.rollback
        ? await runRollback({ target, options: { dryRun: values['dry-run'], yes: values.yes }, deps })
        : await runDeploy({
            target,
            options: {
              dryRun: values['dry-run'],
              forceWindow: values['force-window'],
              skipBuild: values['skip-build'],
              allowDirty: values['allow-dirty'],
              prepareOnly: values['prepare-only'],
              yes: values.yes,
              keep,
            },
            deps,
          })
    return result.ok ? 0 : 1
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

process.exitCode = await main(process.argv.slice(2))
