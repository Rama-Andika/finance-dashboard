import {
  applyLevel,
  compareSemver,
  conventionProblems,
  formatTag,
  laneOf,
  latestRcTag,
  latestStableTag,
  levelOf,
  nextRcNumber,
  notesProblems,
  parseCommit,
  parseOverride,
  parseStableTag,
  rcDiffProblems,
} from './release-rules.mjs'
import { buildNotesSkeleton } from './release-notes.mjs'

/**
 * @typedef {import('./release-rules.mjs').RawCommit} RawCommit
 * @typedef {import('./release-rules.mjs').Lane} Lane
 * @typedef {import('./release-rules.mjs').Semver} Semver
 * @typedef {'stable' | 'rc' | 'notes'} Mode
 * @typedef {{ ok: boolean, status: 'released' | 'dry-run' | 'notes-written' | 'stopped', tag: string, lane: Lane | '' }} ReleaseResult
 * @typedef {{
 *   log: (line: string) => void,
 *   today: () => string,
 *   ask: (question: string) => Promise<string>,
 *   git: {
 *     branch: () => string,
 *     isClean: () => boolean,
 *     fetch: () => boolean,
 *     head: () => string,
 *     remoteHead: () => string,
 *     tags: () => string[],
 *     commitsSince: (tag: string | null) => RawCommit[],
 *     changedFilesSince: (tag: string) => string[],
 *   },
 *   runGate: (gate: 'typecheck' | 'lint' | 'test' | 'build') => boolean,
 *   files: { exists: (path: string) => boolean, read: (path: string) => string, write: (path: string, text: string) => void },
 *   releaseIt: (args: string[]) => number,
 * }} ReleaseDeps
 * @typedef {ReturnType<typeof createContext>} Context what every stage shares
 * @typedef {{
 *   tags: string[],
 *   stableTag: string,
 *   tag: string,
 *   lane: Lane,
 *   asked: ReturnType<typeof levelOf>,
 *   flaggedMajor: boolean,
 *   notesFile: string,
 * }} Plan the version that is going to be made, and what the commits said about it
 */

/** A stop with a message for the person. */
class Stop extends Error {}

const BRANCH = 'main'

/** @param {string} tag */
export const notesPath = (tag) => `docs/releases/${tag}.md`

/**
 * What every stage of a release shares: the dependencies, the numbering of the headings, and the way a problem is
 * recorded. A real run stops at the first problem; a dry run goes on and lists them all.
 * @param {ReleaseDeps} deps
 * @param {boolean} dryRun
 */
function createContext(deps, dryRun) {
  /** @type {string[]} */
  const problems = []
  let step = 0
  return {
    deps,
    dryRun,
    problems,
    /** @param {string} text */
    heading: (text) => deps.log(`\n[${++step}] ${text}`),
    /** @param {string} text */
    problem: (text) => {
      if (!dryRun) throw new Stop(text)
      problems.push(text)
      deps.log(`  PROBLEM: ${text}`)
    },
  }
}

/** Stage: the branch, the working tree and the remote must all be in the state a release needs. @param {Context} ctx */
function checkGit(ctx) {
  const { deps, heading, problem, problems } = ctx
  const { git, log } = deps
  heading(`Check git (branch ${BRANCH}, clean tree, in step with origin)`)
  if (git.branch() !== BRANCH) problem(`you are on branch "${git.branch()}"; a release is made from ${BRANCH}`)
  if (!git.isClean()) problem('the working tree has changes; commit or stash them first (untracked files count too)')
  if (!git.fetch()) problem('"git fetch origin" failed; is there a connection to the remote?')
  else if (git.head() !== git.remoteHead()) {
    problem(
      `${BRANCH} is not in step with origin/${BRANCH}; pull or push first so that this computer and the remote have the same last commit`,
    )
  }
  if (problems.length === 0) log('  ok')
}

/**
 * Stage: every commit since the last release must follow "type(scope): text". The first release has no earlier tag, so
 * its old commits are not checked.
 * @param {Context} ctx
 * @param {string | null} lastTag
 * @param {ReturnType<typeof parseCommit>[]} commits
 */
function checkCommitConvention(ctx, lastTag, commits) {
  const { deps, problem } = ctx
  if (lastTag === null) {
    deps.log('  first release: there is no earlier tag, so the commit messages are not checked')
    return
  }
  deps.log(`  last release ${lastTag}, ${commits.length} commit(s) since`)
  const bad = conventionProblems(commits)
  if (bad.length > 0) {
    problem(
      `${bad.length} commit(s) do not follow "type(scope): text" (types: feat, fix, perf, refactor, docs, style, test, chore, build, ci, revert):\n    - ${bad.join('\n    - ')}\n    Rewrite them (git rebase) before releasing, or release a version by hand-written override after fixing the history.`,
    )
  }
}

/**
 * Stage: the version the owner wants, which is the suggestion unless the owner types (or passes) something else.
 * @param {Context} ctx
 * @param {{ last: Semver | null, suggestion: { next: Semver, flaggedMajor: boolean }, bump: string | undefined, yes: boolean }} input
 * @returns {Promise<{ next: Semver, flaggedMajor: boolean }>}
 */
async function chooseVersion(ctx, { last, suggestion, bump, yes }) {
  const { deps, dryRun } = ctx
  let override = bump
  if (override === undefined && !yes && !dryRun) {
    const answer = (
      await deps.ask(
        `Press Enter to accept ${formatTag(suggestion.next)}, or type patch, minor or an exact version like 1.0.0: `,
      )
    ).trim()
    if (answer !== '') override = answer
  }
  if (override === undefined) return { next: suggestion.next, flaggedMajor: suggestion.flaggedMajor }

  const chosen = parseOverride(override, last)
  if (!chosen.ok) throw new Stop(chosen.problem)
  if (compareSemver(chosen.next, suggestion.next) < 0) {
    deps.log(
      `  WARNING: ${formatTag(chosen.next)} is lower than the ${formatTag(suggestion.next)} that the commits ask for.`,
    )
  }
  return {
    next: chosen.next,
    flaggedMajor: suggestion.flaggedMajor && compareSemver(chosen.next, suggestion.next) >= 0,
  }
}

/** What the person is told about a lane. @param {Lane} lane */
function laneNote(lane) {
  if (lane === 'fast') return ' (patch: no build gate, no release candidate, no finance notes)'
  if (lane === 'first') return ' (first release: build gate, no release candidate, no finance notes)'
  return ' (full: build gate, finance notes, release candidate on staging first)'
}

/**
 * Stage: works out which version is going to be made, from the tags and the commits since the last release.
 * @param {Context} ctx
 * @param {{ mode: Mode, bump: string | undefined, yes: boolean }} input
 * @returns {Promise<Plan>}
 */
async function planVersion(ctx, { mode, bump, yes }) {
  const { deps, heading } = ctx
  heading('Work out the next version')
  const tags = deps.git.tags()
  const lastTag = latestStableTag(tags)
  const last = lastTag ? parseStableTag(lastTag) : null
  const commits = deps.git.commitsSince(lastTag).map(parseCommit)
  checkCommitConvention(ctx, lastTag, commits)

  const asked = levelOf(commits)
  const suggestion =
    last === null ? { next: { major: 0, minor: 1, patch: 0 }, flaggedMajor: false } : applyLevel(last, asked.level)
  deps.log(
    `  the commits ask for: ${last === null ? 'the first release' : asked.level} (${asked.breaking.length} breaking, ${asked.formula.length} formula change, ${asked.features.length} feat, ${asked.fixes.length} fix/perf)`,
  )
  deps.log(
    `  suggested version: ${formatTag(suggestion.next)}${suggestion.flaggedMajor ? ' (major-level change while the version is 0.x: it bumps the minor number but is flagged in the notes)' : ''}`,
  )

  const { next, flaggedMajor } = await chooseVersion(ctx, { last, suggestion, bump, yes })
  const stableTag = formatTag(next)
  const lane = laneOf(last, next)
  const tag = mode === 'rc' ? `${stableTag}-rc.${nextRcNumber(tags, stableTag)}` : stableTag
  deps.log(`  version ${tag}, lane: ${lane}${laneNote(lane)}`)
  return { tags, stableTag, tag, lane, asked, flaggedMajor, notesFile: notesPath(stableTag) }
}

/** Stops for a version that cannot be made in this mode. @param {Plan} plan @param {Mode} mode */
function refuseImpossible(plan, mode) {
  const { tags, tag, stableTag, lane } = plan
  if (tags.includes(tag)) {
    throw new Stop(`the tag ${tag} already exists. A tag is never moved or deleted; fix forward with a new version.`)
  }
  if (mode === 'rc' && lane === 'fast') {
    throw new Stop('a patch release has no release candidate: run "npm run release" without "rc"')
  }
  if (mode === 'notes' && lane !== 'full') {
    throw new Stop(
      `${stableTag} is a ${lane} release and has no finance notes file; only a minor or major release needs one`,
    )
  }
}

/** Stage (notes mode): writes the skeleton of the finance notes. @param {Context} ctx @param {Plan} plan */
function writeNotes(ctx, plan) {
  const { deps, dryRun, heading } = ctx
  const { files, log } = deps
  heading(`Write the finance notes skeleton (${plan.notesFile})`)
  if (files.exists(plan.notesFile)) throw new Stop(`${plan.notesFile} already exists; it is not overwritten`)
  if (dryRun) {
    log(`  (dry run) would write ${plan.notesFile}`)
    return
  }
  files.write(
    plan.notesFile,
    buildNotesSkeleton({
      tag: plan.stableTag,
      today: deps.today(),
      flaggedMajor: plan.flaggedMajor,
      features: plan.asked.features.map((c) => c.subject),
      fixes: plan.asked.fixes.map((c) => c.subject),
      formula: plan.asked.formula.map((c) => c.subject),
      breaking: plan.asked.breaking.map((c) => c.subject),
    }),
  )
  log(
    `  written. Fill in the "Perubahan angka" section (and "Tindakan operator" when it is there), commit the file, then run the release.`,
  )
}

/** Stage (full lane): the finance notes exist and are filled in. @param {Context} ctx @param {Plan} plan */
function checkNotes(ctx, plan) {
  const { deps, heading, problem } = ctx
  const { files, log } = deps
  heading(`Check the finance notes (${plan.notesFile})`)
  if (!files.exists(plan.notesFile)) {
    problem(`${plan.notesFile} does not exist. Write it with "npm run release -- notes", fill it in, and commit it.`)
    return
  }
  const found = notesProblems(files.read(plan.notesFile), {
    needsOperatorSection: plan.asked.breaking.length > 0 || plan.flaggedMajor,
  })
  for (const text of found) problem(`${plan.notesFile}: ${text}`)
  if (found.length === 0) log('  ok')
}

/**
 * Stage (full lane, stable release): a release candidate of this version exists, and since then only the release files
 * have changed.
 * @param {Context} ctx
 * @param {Plan} plan
 */
function checkReleaseCandidate(ctx, plan) {
  const { deps, heading, problem } = ctx
  heading('Check the release candidate')
  const rcTag = latestRcTag(plan.tags, plan.stableTag)
  if (rcTag === null) {
    problem(
      `there is no release candidate of ${plan.stableTag}. Run "npm run release -- rc", install it on staging, check it, then run this again.`,
    )
    return
  }
  const extra = rcDiffProblems(deps.git.changedFilesSince(rcTag))
  if (extra.length > 0) {
    problem(
      `since ${rcTag} these files changed, which a stable release may not contain (only package.json, package-lock.json, CHANGELOG.md and docs/releases/ may change). Make a new release candidate:\n    - ${extra.join('\n    - ')}`,
    )
    return
  }
  deps.log(
    `  ok: ${rcTag} and this commit differ only in package.json, package-lock.json, CHANGELOG.md and docs/releases/`,
  )
}

/** Stage: typecheck, lint and test, and for the full and first lanes the build too. @param {Context} ctx @param {Lane} lane */
function runGates(ctx, lane) {
  const { deps, dryRun, heading } = ctx
  /** @type {Array<'typecheck' | 'lint' | 'test' | 'build'>} */
  const gates = lane === 'fast' ? ['typecheck', 'lint', 'test'] : ['typecheck', 'lint', 'test', 'build']
  heading(`Run the gates (${gates.join(', ')})`)
  if (dryRun) {
    deps.log('  (dry run) not run; a real release runs them')
    return
  }
  for (const gate of gates) {
    deps.log(`  npm run ${gate} ...`)
    if (!deps.runGate(gate)) throw new Stop(`the gate "${gate}" failed`)
    if (gate === 'build' && !deps.git.isClean()) {
      throw new Stop(
        'the build changed tracked files (for example src/routeTree.gen.ts); look at "git status", commit the result, and start again',
      )
    }
  }
  deps.log('  all gates passed')
}

/** Stage: asks for the last confirmations and hands the commit, the tag and the push to release-it. @param {Context} ctx @param {Plan} plan @param {{ mode: Mode, yes: boolean }} input */
async function makeRelease(ctx, plan, { mode, yes }) {
  const { deps, heading } = ctx
  const { tag, lane } = plan
  if (lane === 'full' && mode === 'stable' && !yes) {
    const answer = await deps.ask(
      `Did you install ${latestRcTag(plan.tags, plan.stableTag)} on staging and check it? Type yes to continue: `,
    )
    if (answer.trim().toLowerCase() !== 'yes') throw new Stop('stopped: check the release candidate on staging first')
  }
  heading(`Make the release ${tag}`)
  // A release candidate and the very first release write no CHANGELOG entry (the first entry is written by hand).
  const writesChangelog = !(mode === 'rc' || lane === 'first')
  deps.log(
    `  This sets package.json to ${tag.slice(1)}, ${writesChangelog ? 'adds the entry to CHANGELOG.md' : 'leaves CHANGELOG.md alone'}, makes the commit and the tag ${tag}, and pushes both to origin.`,
  )
  if (!yes) {
    const answer = await deps.ask('Type yes to continue: ')
    if (answer.trim().toLowerCase() !== 'yes') throw new Stop('stopped: nothing was changed')
  }
  const config = writesChangelog ? '.release-it.json' : '.release-it.no-changelog.json'
  const code = deps.releaseIt(['--config', config, tag.slice(1), '--ci'])
  if (code !== 0) {
    throw new Stop(
      `release-it stopped with exit code ${code}. Look at "git status" and "git log -3" before trying again; a tag that was already pushed is never moved.`,
    )
  }
  const stage = mode === 'rc' ? 'staging' : 'production'
  deps.log(
    `\nRELEASED ${tag}. Next: check out the tag (git checkout ${tag}), run "npm run release:pack -- <client> ${stage}", then "git switch main".`,
  )
}

/**
 * One release, as described in docs/project-guide.md chapter 10.9. mode "stable" tags vX.Y.Z, "rc" tags vX.Y.Z-rc.N, and
 * "notes" only writes the finance notes file. With dryRun nothing is written, no gate that takes long is run, and every
 * problem is listed instead of stopping at the first one. The work is done by the stages above, in this order.
 * @param {{ mode: Mode, dryRun?: boolean, yes?: boolean, bump?: string, deps: ReleaseDeps }} input
 * @returns {Promise<ReleaseResult>}
 */
export async function runRelease({ mode, dryRun = false, yes = false, bump, deps }) {
  const ctx = createContext(deps, dryRun)
  /** @type {ReleaseResult} */
  const result = { ok: false, status: 'stopped', tag: '', lane: '' }

  try {
    if (mode !== 'notes') checkGit(ctx)

    const plan = await planVersion(ctx, { mode, bump, yes })
    result.lane = plan.lane
    result.tag = plan.tag
    refuseImpossible(plan, mode)

    if (mode === 'notes') {
      writeNotes(ctx, plan)
      result.ok = ctx.problems.length === 0
      result.status = dryRun ? 'dry-run' : 'notes-written'
      return result
    }

    if (plan.lane === 'full') checkNotes(ctx, plan)
    if (plan.lane === 'full' && mode === 'stable') checkReleaseCandidate(ctx, plan)
    runGates(ctx, plan.lane)

    if (dryRun) {
      deps.log(
        ctx.problems.length === 0
          ? `\nDRY RUN: nothing is in the way. A real run would make ${plan.tag}.`
          : `\nDRY RUN: ${ctx.problems.length} problem(s) above must be fixed first. Nothing was changed.`,
      )
      result.ok = ctx.problems.length === 0
      result.status = 'dry-run'
      return result
    }

    await makeRelease(ctx, plan, { mode, yes })
    result.ok = true
    result.status = 'released'
  } catch (error) {
    if (!(error instanceof Stop)) throw error
    deps.log(`\nSTOPPED: ${error.message}`)
  }
  return result
}
