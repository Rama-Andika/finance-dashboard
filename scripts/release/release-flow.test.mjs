import { describe, expect, it } from 'vitest'
import { buildNotesSkeleton } from './release-notes.mjs'
import { runRelease } from './release-flow.mjs'

/** Deps with everything recorded. `config` overrides what the fake git and files say. */
function makeDeps(config = {}) {
  const logs = []
  const written = {}
  const calls = { gates: [], releaseIt: [] }
  const state = {
    branch: config.branch ?? 'main',
    clean: config.clean ?? true,
    head: config.head ?? 'aaa',
    remote: config.remote ?? 'aaa',
    tags: config.tags ?? ['v0.1.0'],
    commits: config.commits ?? [{ subject: 'fix: a', body: '' }],
    changed: config.changed ?? [],
    files: { ...(config.files ?? {}) },
    answers: [...(config.answers ?? [])],
  }
  const deps = {
    log: (line) => logs.push(line),
    today: () => '2026-11-13',
    ask: async (question) => {
      logs.push(`ASK ${question}`)
      return state.answers.shift() ?? ''
    },
    git: {
      branch: () => state.branch,
      isClean: () => state.clean,
      fetch: () => config.fetchOk ?? true,
      head: () => state.head,
      remoteHead: () => state.remote,
      tags: () => state.tags,
      commitsSince: () => state.commits,
      changedFilesSince: () => state.changed,
    },
    runGate: (gate) => {
      calls.gates.push(gate)
      return gate !== config.gateFail
    },
    files: {
      exists: (path) => path in state.files,
      read: (path) => state.files[path],
      write: (path, text) => {
        written[path] = text
        state.files[path] = text
      },
    },
    releaseIt: (args) => {
      calls.releaseIt.push(args)
      return config.releaseItCode ?? 0
    },
  }
  return { deps, state, written, calls, text: () => logs.join('\n') }
}

const NOTES = '## Perubahan angka\nTidak ada angka yang berubah.\n'
const feat = [{ subject: 'feat: x', body: '' }]

describe('runRelease: the fast lane (patch)', () => {
  it('runs typecheck, lint and test only, asks once, and calls release-it with the version', async () => {
    const made = makeDeps({ answers: ['', 'yes'] })
    const result = await runRelease({ mode: 'stable', deps: made.deps })
    expect(result).toEqual({ ok: true, status: 'released', tag: 'v0.1.1', lane: 'fast' })
    expect(made.calls.gates).toEqual(['typecheck', 'lint', 'test'])
    expect(made.calls.releaseIt).toEqual([['--config', '.release-it.json', '0.1.1', '--ci']])
  })

  it('asks nothing with --yes', async () => {
    const made = makeDeps()
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('released')
    expect(made.text()).not.toContain('ASK')
  })

  it('refuses a release candidate for a patch', async () => {
    const made = makeDeps()
    expect((await runRelease({ mode: 'rc', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('a patch release has no release candidate')
  })
})

describe('runRelease: git checks', () => {
  it('stops at once on the wrong branch or a dirty tree, before any gate', async () => {
    const made = makeDeps({ branch: 'dev', clean: false })
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('you are on branch "dev"')
    expect(made.calls.gates).toEqual([])
  })

  it('stops when main is not in step with origin', async () => {
    const made = makeDeps({ remote: 'bbb' })
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('not in step with origin/main')
  })

  it('stops on a commit that does not follow the convention', async () => {
    const made = makeDeps({ commits: [{ subject: 'Add stuff', body: '' }] })
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('Add stuff')
  })
})

describe('runRelease: a dry run', () => {
  it('lists every problem, runs no gate, and changes nothing', async () => {
    const made = makeDeps({ branch: 'dev', clean: false, remote: 'bbb' })
    const result = await runRelease({ mode: 'stable', dryRun: true, deps: made.deps })
    expect(result).toMatchObject({ ok: false, status: 'dry-run' })
    expect(made.calls.gates).toEqual([])
    expect(made.calls.releaseIt).toEqual([])
    expect(made.text()).toContain('you are on branch "dev"')
    expect(made.text()).toContain('the working tree has changes')
    expect(made.text()).toContain('not in step with origin/main')
  })

  it('says what is in the way of a minor release and how to fix it', async () => {
    const made = makeDeps({ commits: feat })
    const result = await runRelease({ mode: 'stable', dryRun: true, deps: made.deps })
    expect(result).toMatchObject({ ok: false, status: 'dry-run', tag: 'v0.2.0', lane: 'full' })
    expect(made.text()).toContain('docs/releases/v0.2.0.md does not exist')
    expect(made.text()).toContain('there is no release candidate of v0.2.0')
  })
})

describe('runRelease: the full lane (minor and major)', () => {
  it('needs the finance notes', async () => {
    const made = makeDeps({ commits: feat })
    expect((await runRelease({ mode: 'rc', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('docs/releases/v0.2.0.md does not exist')
  })

  it('makes a release candidate after the build gate, and numbers the next one', async () => {
    const made = makeDeps({ commits: feat, files: { 'docs/releases/v0.2.0.md': NOTES }, answers: ['', 'yes'] })
    expect(await runRelease({ mode: 'rc', deps: made.deps })).toEqual({
      ok: true,
      status: 'released',
      tag: 'v0.2.0-rc.1',
      lane: 'full',
    })
    expect(made.calls.gates).toEqual(['typecheck', 'lint', 'test', 'build'])
    expect(made.calls.releaseIt).toEqual([['--config', '.release-it.no-changelog.json', '0.2.0-rc.1', '--ci']])

    const second = makeDeps({
      tags: ['v0.1.0', 'v0.2.0-rc.1'],
      commits: feat,
      files: { 'docs/releases/v0.2.0.md': NOTES },
    })
    expect((await runRelease({ mode: 'rc', yes: true, deps: second.deps })).tag).toBe('v0.2.0-rc.2')
  })

  it('refuses the stable release without a release candidate', async () => {
    const made = makeDeps({ commits: feat, files: { 'docs/releases/v0.2.0.md': NOTES } })
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('there is no release candidate of v0.2.0')
  })

  it('makes the stable release when only the release files changed since the release candidate', async () => {
    const made = makeDeps({
      tags: ['v0.1.0', 'v0.2.0-rc.1'],
      commits: [...feat, { subject: 'chore(release): v0.2.0-rc.1', body: '' }],
      files: { 'docs/releases/v0.2.0.md': NOTES },
      changed: ['package.json', 'docs/releases/v0.2.0.md'],
      answers: ['', 'yes', 'yes'],
    })
    expect(await runRelease({ mode: 'stable', deps: made.deps })).toEqual({
      ok: true,
      status: 'released',
      tag: 'v0.2.0',
      lane: 'full',
    })
    expect(made.calls.releaseIt).toEqual([['--config', '.release-it.json', '0.2.0', '--ci']])
  })

  it('refuses the stable release when other files changed since the release candidate', async () => {
    const made = makeDeps({
      tags: ['v0.1.0', 'v0.2.0-rc.1'],
      commits: feat,
      files: { 'docs/releases/v0.2.0.md': NOTES },
      changed: ['src/a.ts'],
    })
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('src/a.ts')
  })

  it('stops when the build leaves tracked files changed', async () => {
    const made = makeDeps({ commits: feat, files: { 'docs/releases/v0.2.0.md': NOTES } })
    let asked = 0
    made.deps.git.isClean = () => ++asked <= 1
    expect((await runRelease({ mode: 'rc', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('the build changed tracked files')
  })
})

describe('runRelease: gates, override and release-it', () => {
  it('stops at the first gate that fails', async () => {
    const made = makeDeps({ gateFail: 'lint' })
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.calls.gates).toEqual(['typecheck', 'lint'])
    expect(made.calls.releaseIt).toEqual([])
  })

  it('lets the owner choose an exact version, and refuses one that is not newer', async () => {
    const made = makeDeps({ tags: ['v0.9.0'], files: { 'docs/releases/v1.0.0.md': NOTES } })
    const result = await runRelease({ mode: 'rc', bump: '1.0.0', yes: true, deps: made.deps })
    expect(result).toMatchObject({ tag: 'v1.0.0-rc.1', lane: 'full' })

    const same = makeDeps({ tags: ['v0.1.0'] })
    expect((await runRelease({ mode: 'stable', bump: '0.1.0', yes: true, deps: same.deps })).status).toBe('stopped')
  })

  it('reports a failure of release-it', async () => {
    const made = makeDeps({ releaseItCode: 1 })
    expect((await runRelease({ mode: 'stable', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.text()).toContain('exit code 1')
  })

  it('treats a repository without a tag as the first release: build gate, no notes, no release candidate', async () => {
    const made = makeDeps({ tags: [], commits: [{ subject: 'Add an old thing', body: '' }] })
    expect(await runRelease({ mode: 'stable', yes: true, deps: made.deps })).toEqual({
      ok: true,
      status: 'released',
      tag: 'v0.1.0',
      lane: 'first',
    })
    expect(made.calls.gates).toEqual(['typecheck', 'lint', 'test', 'build'])
    // no CHANGELOG entry is generated for the first release: the old history is not listed
    expect(made.calls.releaseIt).toEqual([['--config', '.release-it.no-changelog.json', '0.1.0', '--ci']])
  })
})

describe('runRelease: the notes mode', () => {
  it('writes a skeleton that lists the commits and lets the check fail until it is filled in', async () => {
    const made = makeDeps({ commits: [...feat, { subject: 'fix: y', body: 'Formula-Change: revenue' }] })
    expect((await runRelease({ mode: 'notes', yes: true, deps: made.deps })).status).toBe('notes-written')
    const text = made.written['docs/releases/v0.2.0.md']
    expect(text).toContain('# Catatan rilis v0.2.0')
    expect(text).toContain('- feat: x')
    expect(text).toContain('- fix: y')
    expect(text).toContain('TODO')
  })

  it('does not overwrite a file, and has nothing to write for a patch', async () => {
    const made = makeDeps({ commits: feat, files: { 'docs/releases/v0.2.0.md': 'mine' } })
    expect((await runRelease({ mode: 'notes', yes: true, deps: made.deps })).status).toBe('stopped')
    expect(made.written).toEqual({})
    expect((await runRelease({ mode: 'notes', yes: true, deps: makeDeps().deps })).status).toBe('stopped')
  })
})

describe('buildNotesSkeleton', () => {
  const base = {
    tag: 'v0.2.0',
    today: '2026-11-13',
    flaggedMajor: false,
    features: [],
    fixes: [],
    formula: [],
    breaking: [],
  }

  it('has the sections finance reads, and no operator section without a breaking change', () => {
    const text = buildNotesSkeleton(base)
    for (const heading of ['## Ringkasan', '## Perubahan angka', '## Fitur baru', '## Perbaikan']) {
      expect(text).toContain(heading)
    }
    expect(text).not.toContain('## Tindakan operator')
  })

  it('adds the operator section for a breaking change', () => {
    expect(buildNotesSkeleton({ ...base, breaking: ['feat!: x'] })).toContain('## Tindakan operator')
    expect(buildNotesSkeleton({ ...base, flaggedMajor: true })).toContain('## Tindakan operator')
  })
})
