// Makes one release: npm run release -- [rc | notes] [--dry-run] [--yes] [--bump <patch|minor|X.Y.Z>]
// Run from the project folder on the owner's computer. It checks the gates, works out the version, and hands the tag, the
// package.json version, the CHANGELOG entry and the push to release-it. See docs/release-deploy-guide.html#versi.
// This file only connects the real world (git, npm, the disk, the keyboard, release-it) to the flow in release-flow.mjs,
// where every decision is made and tested.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { runRelease } from './release-flow.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const RELEASE_IT_BIN = join(root, 'node_modules', 'release-it', 'bin', 'release-it.js')

const USAGE = `Usage: npm run release -- [stable | rc | notes] [--dry-run] [--yes] [--bump <patch|minor|X.Y.Z>]

  (no word)      make the stable release vX.Y.Z (the default)
  rc             make a release candidate vX.Y.Z-rc.N (minor and major releases only)
  notes          write the finance notes skeleton docs/releases/vX.Y.Z.md (minor and major releases only)
  --dry-run      only show the next version, the lane and what is in the way; changes nothing, runs no slow gate
  --yes          do not ask questions (accepts the suggested version)
  --bump <what>  patch, minor, or an exact newer version such as 1.0.0, instead of the suggestion`

/** The output of git in the project folder; throws when git fails. @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** @param {string[]} args @returns {string} an empty text when git fails */
function gitOrEmpty(args) {
  try {
    return git(args)
  } catch {
    return ''
  }
}

/** @param {string} text @returns {string[]} */
function lines(text) {
  return text.split(/\r?\n/).filter((line) => line !== '')
}

const realGit = {
  branch: () => gitOrEmpty(['rev-parse', '--abbrev-ref', 'HEAD']),
  isClean: () => gitOrEmpty(['status', '--porcelain']) === '',
  fetch() {
    try {
      git(['fetch', 'origin', '--tags'])
      return true
    } catch {
      return false
    }
  },
  head: () => gitOrEmpty(['rev-parse', 'HEAD']),
  remoteHead: () => gitOrEmpty(['rev-parse', 'origin/main']),
  tags: () => lines(gitOrEmpty(['tag', '--list'])),
  /** The commits after a tag (all commits when there is none), merges left out: subject and body of each. @param {string | null} tag */
  commitsSince(tag) {
    const range = tag === null ? 'HEAD' : `${tag}..HEAD`
    const out = git(['log', range, '--no-merges', '--format=%s%x1f%b%x1e'])
    return out
      .split('\x1e')
      .map((chunk) => chunk.replace(/^\r?\n/, ''))
      .filter((chunk) => chunk.trim() !== '')
      .map((chunk) => {
        const [subject = '', body = ''] = chunk.split('\x1f')
        return { subject: subject.trim(), body }
      })
  },
  /** @param {string} tag */
  changedFilesSince: (tag) => lines(git(['diff', '--name-only', tag, 'HEAD'])),
}

/** @param {'typecheck' | 'lint' | 'test' | 'build'} gate */
function runGate(gate) {
  // One fixed command text, never built from input; "shell" is what lets Windows start npm.
  return spawnSync(`npm run ${gate}`, { cwd: root, stdio: 'inherit', shell: true }).status === 0
}

/** @param {string} question */
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

/** @param {string[]} args @returns {number} */
function releaseIt(args) {
  return spawnSync(process.execPath, [RELEASE_IT_BIN, ...args], { cwd: root, stdio: 'inherit' }).status ?? 1
}

/** @param {string[]} argv @returns {Promise<number>} the exit code */
async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'dry-run': { type: 'boolean' },
        yes: { type: 'boolean' },
        bump: { type: 'string' },
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
  const word = positionals[0] ?? 'stable'
  if (positionals.length > 1 || (word !== 'stable' && word !== 'rc' && word !== 'notes')) {
    console.error(USAGE)
    return 2
  }
  const dryRun = values['dry-run'] === true
  if (word !== 'notes' && !dryRun && !existsSync(RELEASE_IT_BIN)) {
    console.error('release-it is not installed here. Run "npm ci" first (release-it is a dev dependency).')
    return 1
  }
  const result = await runRelease({
    mode: word,
    dryRun,
    yes: values.yes === true,
    bump: values.bump,
    deps: {
      log: (line) => console.log(line),
      today: () => new Date().toISOString().slice(0, 10),
      ask,
      git: realGit,
      runGate,
      files: {
        exists: (path) => existsSync(join(root, path)),
        read: (path) => readFileSync(join(root, path), 'utf8'),
        write: (path, text) => {
          mkdirSync(dirname(join(root, path)), { recursive: true })
          writeFileSync(join(root, path), text)
        },
      },
      releaseIt,
    },
  })
  return result.ok ? 0 : 1
}

process.exitCode = await main(process.argv.slice(2))
