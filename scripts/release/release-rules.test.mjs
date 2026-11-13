import { describe, expect, it } from 'vitest'
import {
  applyLevel,
  conventionProblems,
  laneOf,
  latestRcTag,
  latestStableTag,
  levelOf,
  nextRcNumber,
  notesProblems,
  parseCommit,
  parseOverride,
  rcDiffProblems,
} from './release-rules.mjs'

const v = (major, minor, patch) => ({ major, minor, patch })
const commit = (subject, body = '') => parseCommit({ subject, body })

describe('tags', () => {
  it('finds the newest stable tag by its numbers, not by order, and ignores release candidates', () => {
    expect(latestStableTag(['v0.9.0', 'v0.10.0', 'v0.2.0-rc.1', 'v0.11.0-rc.2', 'junk'])).toBe('v0.10.0')
    expect(latestStableTag([])).toBeNull()
  })

  it('counts release candidates per version', () => {
    expect(nextRcNumber(['v0.2.0-rc.1', 'v0.2.0-rc.2', 'v0.3.0-rc.5'], 'v0.2.0')).toBe(3)
    expect(nextRcNumber([], 'v0.2.0')).toBe(1)
    expect(latestRcTag(['v0.2.0-rc.1', 'v0.2.0-rc.2'], 'v0.2.0')).toBe('v0.2.0-rc.2')
    expect(latestRcTag(['v0.3.0-rc.1'], 'v0.2.0')).toBeNull()
  })
})

describe('parseCommit', () => {
  it('reads type, scope and the two markers', () => {
    expect(commit('feat(summary): add a card')).toEqual({
      subject: 'feat(summary): add a card',
      type: 'feat',
      scope: 'summary',
      breaking: false,
      formulaChange: false,
      conventional: true,
    })
    expect(commit('feat!: drop a column').breaking).toBe(true)
    expect(commit('fix(db)!: x').breaking).toBe(true)
    expect(commit('fix: x', 'Text\n\nBREAKING CHANGE: needs a new env variable').breaking).toBe(true)
    expect(commit('fix: x', 'Formula-Change: revenue leaves out credit notes').formulaChange).toBe(true)
  })

  it('knows a subject that does not follow the convention', () => {
    expect(commit('Add something').conventional).toBe(false)
    expect(commit('feat:no space').conventional).toBe(false)
    expect(commit('chore(release): v0.2.0').conventional).toBe(true)
    expect(conventionProblems([commit('Add x'), commit('fix: y')])).toEqual(['Add x'])
  })
})

describe('levelOf and applyLevel', () => {
  it('asks for the highest level the commits need', () => {
    expect(levelOf([commit('fix: a'), commit('docs: b')]).level).toBe('patch')
    expect(levelOf([]).level).toBe('patch')
    expect(levelOf([commit('fix: a'), commit('feat: b')]).level).toBe('minor')
    expect(levelOf([commit('fix: a', 'Formula-Change: x')]).level).toBe('minor')
    expect(levelOf([commit('feat!: a'), commit('feat: b')]).level).toBe('major')
  })

  it('bumps the numbers, and lets a major-level change bump the minor number while the version is 0.x', () => {
    expect(applyLevel(v(0, 1, 0), 'patch')).toEqual({ next: v(0, 1, 1), flaggedMajor: false })
    expect(applyLevel(v(0, 1, 3), 'minor')).toEqual({ next: v(0, 2, 0), flaggedMajor: false })
    expect(applyLevel(v(0, 1, 3), 'major')).toEqual({ next: v(0, 2, 0), flaggedMajor: true })
    expect(applyLevel(v(1, 4, 2), 'minor')).toEqual({ next: v(1, 5, 0), flaggedMajor: false })
    expect(applyLevel(v(1, 4, 2), 'major')).toEqual({ next: v(2, 0, 0), flaggedMajor: true })
  })
})

describe('laneOf', () => {
  it('is first without an earlier release, fast for a patch and full otherwise', () => {
    expect(laneOf(null, v(0, 1, 0))).toBe('first')
    expect(laneOf(v(0, 1, 0), v(0, 1, 1))).toBe('fast')
    expect(laneOf(v(0, 1, 0), v(0, 2, 0))).toBe('full')
    expect(laneOf(v(0, 9, 0), v(1, 0, 0))).toBe('full')
  })
})

describe('parseOverride', () => {
  it('accepts patch, minor and an exact newer version', () => {
    expect(parseOverride('patch', v(0, 1, 0))).toEqual({ ok: true, next: v(0, 1, 1) })
    expect(parseOverride('minor', null)).toEqual({ ok: true, next: v(0, 1, 0) })
    expect(parseOverride('1.0.0', v(0, 9, 0))).toEqual({ ok: true, next: v(1, 0, 0) })
    expect(parseOverride('v1.0.0', v(0, 9, 0))).toEqual({ ok: true, next: v(1, 0, 0) })
  })

  it('refuses the rest, also a version that is not newer and the word major', () => {
    expect(parseOverride('0.9.0', v(0, 9, 0)).ok).toBe(false)
    expect(parseOverride('abc', v(0, 9, 0)).ok).toBe(false)
    expect(parseOverride('major', v(0, 9, 0)).ok).toBe(false)
  })
})

describe('rcDiffProblems', () => {
  it('lets only the release files change between the release candidate and the stable release', () => {
    expect(rcDiffProblems(['package.json', 'package-lock.json', 'CHANGELOG.md', 'docs/releases/v0.2.0.md'])).toEqual([])
    expect(rcDiffProblems(['src/a.ts', 'package.json', 'docs/other.md'])).toEqual(['src/a.ts', 'docs/other.md'])
  })
})

describe('notesProblems', () => {
  const filled =
    '# Catatan\n\n## Ringkasan\nx\n\n## Perubahan angka\nTidak ada angka yang berubah.\n\n## Fitur baru\n- a\n'

  it('accepts a filled "Perubahan angka" section', () => {
    expect(notesProblems(filled, { needsOperatorSection: false })).toEqual([])
  })

  it('wants "Tindakan operator" too when the release has a breaking change', () => {
    expect(notesProblems(filled, { needsOperatorSection: true })).toEqual([
      'the section "## Tindakan operator" is missing',
    ])
  })

  it('refuses a missing, an empty and a still-TODO section, and ignores comments', () => {
    expect(notesProblems('nothing', { needsOperatorSection: false })).toEqual([
      'the section "## Perubahan angka" is missing',
    ])
    expect(notesProblems('## Perubahan angka\n<!-- hint -->\n\n## Fitur\nx', { needsOperatorSection: false })).toEqual([
      'the section "## Perubahan angka" is empty',
    ])
    expect(
      notesProblems('## Perubahan angka\n<!-- hint -->\nTODO: isi\n## Fitur\n', { needsOperatorSection: false }),
    ).toEqual(['the section "## Perubahan angka" still has the TODO placeholder'])
  })
})
