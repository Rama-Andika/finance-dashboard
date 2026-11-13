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
 */

/** A stop with a message for the person. */
class Stop extends Error {}

const BRANCH = 'main'

/** @param {string} tag */
export const notesPath = (tag) => `docs/releases/${tag}.md`

/**
 * One release, as described in docs/project-guide.md chapter 10.9. mode "stable" tags vX.Y.Z, "rc" tags vX.Y.Z-rc.N, and
 * "notes" only writes the finance notes file. With dryRun nothing is written, no gate that takes long is run, and every
 * problem is listed instead of stopping at the first one.
 * @param {{ mode: Mode, dryRun?: boolean, yes?: boolean, bump?: string, deps: ReleaseDeps }} input
 * @returns {Promise<ReleaseResult>}
 */
export async function runRelease({ mode, dryRun = false, yes = false, bump, deps }) {
  const { log, git, files } = deps
  /** @type {ReleaseResult} */
  const result = { ok: false, status: 'stopped', tag: '', lane: '' }
  /** @type {string[]} */
  const problems = []
  let step = 0
  /** @param {string} text */
  const heading = (text) => log(`\n[${++step}] ${text}`)
  /** Records a problem: a real run stops at once, a dry run goes on. @param {string} text */
  const problem = (text) => {
    if (!dryRun) throw new Stop(text)
    problems.push(text)
    log(`  PROBLEM: ${text}`)
  }

  try {
    if (mode !== 'notes') {
      heading(`Check git (branch ${BRANCH}, clean tree, in step with origin)`)
      if (git.branch() !== BRANCH) problem(`you are on branch "${git.branch()}"; a release is made from ${BRANCH}`)
      if (!git.isClean())
        problem('the working tree has changes; commit or stash them first (untracked files count too)')
      if (!git.fetch()) problem('"git fetch origin" failed; is there a connection to the remote?')
      else if (git.head() !== git.remoteHead()) {
        problem(
          `${BRANCH} is not in step with origin/${BRANCH}; pull or push first so that this computer and the remote have the same last commit`,
        )
      }
      if (problems.length === 0) log('  ok')
    }

    heading('Work out the next version')
    const tags = git.tags()
    const lastTag = latestStableTag(tags)
    const last = lastTag ? parseStableTag(lastTag) : null
    const raw = git.commitsSince(lastTag)
    const commits = raw.map(parseCommit)
    if (lastTag === null) {
      log('  first release: there is no earlier tag, so the commit messages are not checked')
    } else {
      log(`  last release ${lastTag}, ${commits.length} commit(s) since`)
      const bad = conventionProblems(commits)
      if (bad.length > 0) {
        problem(
          `${bad.length} commit(s) do not follow "type(scope): text" (types: feat, fix, perf, refactor, docs, style, test, chore, build, ci, revert):\n    - ${bad.join('\n    - ')}\n    Rewrite them (git rebase) before releasing, or release a version by hand-written override after fixing the history.`,
        )
      }
    }
    const asked = levelOf(commits)
    const suggestion =
      last === null ? { next: { major: 0, minor: 1, patch: 0 }, flaggedMajor: false } : applyLevel(last, asked.level)
    log(
      `  the commits ask for: ${last === null ? 'the first release' : asked.level} (${asked.breaking.length} breaking, ${asked.formula.length} formula change, ${asked.features.length} feat, ${asked.fixes.length} fix/perf)`,
    )
    log(
      `  suggested version: ${formatTag(suggestion.next)}${suggestion.flaggedMajor ? ' (major-level change while the version is 0.x: it bumps the minor number but is flagged in the notes)' : ''}`,
    )

    let next = suggestion.next
    let flaggedMajor = suggestion.flaggedMajor
    /** @type {string | undefined} */
    let override = bump
    if (override === undefined && !yes && !dryRun) {
      const answer = (
        await deps.ask(
          `Press Enter to accept ${formatTag(next)}, or type patch, minor or an exact version like 1.0.0: `,
        )
      ).trim()
      if (answer !== '') override = answer
    }
    if (override !== undefined) {
      const chosen = parseOverride(override, last)
      if (!chosen.ok) throw new Stop(chosen.problem)
      if (compareSemver(chosen.next, suggestion.next) < 0) {
        log(
          `  WARNING: ${formatTag(chosen.next)} is lower than the ${formatTag(suggestion.next)} that the commits ask for.`,
        )
      }
      next = chosen.next
      flaggedMajor = flaggedMajor && compareSemver(chosen.next, suggestion.next) >= 0
    }
    const stableTag = formatTag(next)
    const lane = laneOf(last, next)
    result.lane = lane
    const rcNumber = nextRcNumber(tags, stableTag)
    const tag = mode === 'rc' ? `${stableTag}-rc.${rcNumber}` : stableTag
    result.tag = tag
    log(
      `  version ${tag}, lane: ${lane}${lane === 'fast' ? ' (patch: no build gate, no release candidate, no finance notes)' : lane === 'first' ? ' (first release: build gate, no release candidate, no finance notes)' : ' (full: build gate, finance notes, release candidate on staging first)'}`,
    )
    if (tags.includes(tag))
      throw new Stop(`the tag ${tag} already exists. A tag is never moved or deleted; fix forward with a new version.`)

    if (mode === 'rc' && lane === 'fast') {
      throw new Stop('a patch release has no release candidate: run "npm run release" without "rc"')
    }
    if (mode === 'notes' && lane !== 'full') {
      throw new Stop(
        `${stableTag} is a ${lane} release and has no finance notes file; only a minor or major release needs one`,
      )
    }

    const path = notesPath(stableTag)
    if (mode === 'notes') {
      heading(`Write the finance notes skeleton (${path})`)
      if (files.exists(path)) throw new Stop(`${path} already exists; it is not overwritten`)
      if (dryRun) {
        log(`  (dry run) would write ${path}`)
      } else {
        files.write(
          path,
          buildNotesSkeleton({
            tag: stableTag,
            today: deps.today(),
            flaggedMajor,
            features: asked.features.map((c) => c.subject),
            fixes: asked.fixes.map((c) => c.subject),
            formula: asked.formula.map((c) => c.subject),
            breaking: asked.breaking.map((c) => c.subject),
          }),
        )
        log(
          `  written. Fill in the "Perubahan angka" section (and "Tindakan operator" when it is there), commit the file, then run the release.`,
        )
      }
      result.ok = problems.length === 0
      result.status = dryRun ? 'dry-run' : 'notes-written'
      return result
    }

    if (lane === 'full') {
      heading(`Check the finance notes (${path})`)
      if (!files.exists(path)) {
        problem(`${path} does not exist. Write it with "npm run release -- notes", fill it in, and commit it.`)
      } else {
        const found = notesProblems(files.read(path), {
          needsOperatorSection: asked.breaking.length > 0 || flaggedMajor,
        })
        for (const text of found) problem(`${path}: ${text}`)
        if (found.length === 0) log('  ok')
      }
    }

    if (lane === 'full' && mode === 'stable') {
      heading('Check the release candidate')
      const rcTag = latestRcTag(tags, stableTag)
      if (rcTag === null) {
        problem(
          `there is no release candidate of ${stableTag}. Run "npm run release -- rc", install it on staging, check it, then run this again.`,
        )
      } else {
        const extra = rcDiffProblems(git.changedFilesSince(rcTag))
        if (extra.length > 0) {
          problem(
            `since ${rcTag} these files changed, which a stable release may not contain (only package.json, package-lock.json, CHANGELOG.md and docs/releases/ may change). Make a new release candidate:\n    - ${extra.join('\n    - ')}`,
          )
        } else {
          log(
            `  ok: ${rcTag} and this commit differ only in package.json, package-lock.json, CHANGELOG.md and docs/releases/`,
          )
        }
      }
    }

    /** @type {Array<'typecheck' | 'lint' | 'test' | 'build'>} */
    const gates = lane === 'fast' ? ['typecheck', 'lint', 'test'] : ['typecheck', 'lint', 'test', 'build']
    heading(`Run the gates (${gates.join(', ')})`)
    if (dryRun) {
      log('  (dry run) not run; a real release runs them')
    } else {
      for (const gate of gates) {
        log(`  npm run ${gate === 'build' ? 'build' : gate} ...`)
        if (!deps.runGate(gate)) throw new Stop(`the gate "${gate}" failed`)
        if (gate === 'build' && !git.isClean()) {
          throw new Stop(
            'the build changed tracked files (for example src/routeTree.gen.ts); look at "git status", commit the result, and start again',
          )
        }
      }
      log('  all gates passed')
    }

    if (dryRun) {
      log(
        problems.length === 0
          ? `\nDRY RUN: nothing is in the way. A real run would make ${tag}.`
          : `\nDRY RUN: ${problems.length} problem(s) above must be fixed first. Nothing was changed.`,
      )
      result.ok = problems.length === 0
      result.status = 'dry-run'
      return result
    }

    if (lane === 'full' && mode === 'stable' && !yes) {
      const answer = await deps.ask(
        `Did you install ${latestRcTag(tags, stableTag)} on staging and check it? Type yes to continue: `,
      )
      if (answer.trim().toLowerCase() !== 'yes') throw new Stop('stopped: check the release candidate on staging first')
    }
    heading(`Make the release ${tag}`)
    log(
      `  This sets package.json to ${tag.slice(1)}, ${mode === 'rc' || lane === 'first' ? 'leaves CHANGELOG.md alone' : 'adds the entry to CHANGELOG.md'}, makes the commit and the tag ${tag}, and pushes both to origin.`,
    )
    if (!yes) {
      const answer = await deps.ask('Type yes to continue: ')
      if (answer.trim().toLowerCase() !== 'yes') throw new Stop('stopped: nothing was changed')
    }
    // A release candidate and the very first release write no CHANGELOG entry (the first entry is written by hand).
    const config = mode === 'rc' || lane === 'first' ? '.release-it.no-changelog.json' : '.release-it.json'
    const code = deps.releaseIt(['--config', config, tag.slice(1), '--ci'])
    if (code !== 0)
      throw new Stop(
        `release-it stopped with exit code ${code}. Look at "git status" and "git log -3" before trying again; a tag that was already pushed is never moved.`,
      )
    log(
      `\nRELEASED ${tag}. Next: ${mode === 'rc' ? `check out the tag (git checkout ${tag}), run "npm run release:pack -- <client> staging", then "git switch main"` : `check out the tag (git checkout ${tag}), run "npm run release:pack -- <client> production", then "git switch main"`}.`,
    )
    result.ok = true
    result.status = 'released'
  } catch (error) {
    if (!(error instanceof Stop)) throw error
    log(`\nSTOPPED: ${error.message}`)
  }
  return result
}
