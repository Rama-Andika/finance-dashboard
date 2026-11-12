import { describe, expect, it } from 'vitest'
import { runDeploy, runRollback, runStatus } from './deploy-flow.mjs'
import { parseTargets } from './targets.mjs'

const ROOT_STAGING = '/home/oxy/web-server/oxy-acme-staging-finance-dashboard-5205'
const ROOT_PRODUCTION = '/home/oxy/web-server/oxy-acme-production-finance-dashboard-5105'
const { targets } = parseTargets(
  JSON.stringify({
    'acme-staging': { ssh: 'oxy@staging.example.com', root: ROOT_STAGING, timezone: 'Asia/Jakarta' },
    'acme-production': { ssh: 'oxy@erp.acme.example', root: ROOT_PRODUCTION, timezone: 'Asia/Jakarta' },
  }),
)
const STAGING = targets.find((target) => target.env === 'staging')
const PRODUCTION = targets.find((target) => target.env === 'production')
const PREVIOUS = '20261101000000-v1.0.0'
const OK = { code: 0, stdout: '', stderr: '' }

/** A short name for what a remote command does, so that a test can compare the order of steps. */
function kindOf({ argv }) {
  const joined = argv.join(' ')
  if (argv[0] === 'test' && argv[1] === '-d') return 'check-folder'
  if (argv[0] === 'test' && argv[1] === '-f') return 'check-env-file'
  if (argv[0] === 'test' && argv[1] === '-L') return 'check-current'
  if (argv[0] === 'mkdir' && argv[1].endsWith('.deploy.lock')) return 'lock'
  if (argv[0] === 'mkdir' && argv[1] === '-p') return 'mkdir-incoming'
  if (argv[0] === 'mkdir') return 'mkdir-temp'
  if (argv[0] === 'tar') return 'untar'
  if (argv[0] === 'mv') return 'rename'
  if (argv[0] === 'rm' && argv[1] === '-f') return 'rm-archive'
  if (argv[0] === 'rm' && argv[2].endsWith('.deploy.lock')) return 'unlock'
  if (argv[0] === 'rm') return 'rm-release'
  if (argv[0] === 'sudo') return 'restart'
  if (argv[1] === 'ci') return 'npm-ci'
  if (joined.includes('release.mjs doctor')) return 'doctor'
  if (joined.includes('release.mjs activate')) return 'activate'
  if (joined.includes('release.mjs rollback')) return 'rollback'
  if (joined.includes('release.mjs cleanup')) return 'cleanup'
  if (joined.includes('release.mjs list') && joined.includes('--json')) return 'list-json'
  if (joined.includes('release.mjs list')) return 'list'
  if (joined.includes('health-check.mjs')) return 'health'
  if (joined.includes('env-check.mjs')) return 'env-check'
  if (joined.includes('dash-migrate.mjs')) return 'migrate'
  return `unknown: ${joined}`
}

function defaultAnswer(call) {
  const kind = kindOf(call)
  if (kind === 'activate') return { code: 0, stdout: `activated new\nprevious ${PREVIOUS}\n`, stderr: '' }
  if (kind === 'rollback') return { code: 0, stdout: `rolled back to ${PREVIOUS}\nfrom new\n`, stderr: '' }
  if (kind === 'list-json') {
    return {
      code: 0,
      stdout: JSON.stringify({ current: PREVIOUS, previous: 'x', releases: [{ name: PREVIOUS, version: 'v1.0.0' }] }),
      stderr: '',
    }
  }
  return OK
}

/**
 * Deps with everything recorded. `answer(call, count)` may return a result for a remote command; undefined means the default answer.
 * @param {{ target?: object, version?: string, exactTag?: string | null, dirty?: boolean, now?: string, answer?: Function, uploadCode?: number,
 *   confirmed?: boolean, buildOk?: boolean, buildInfo?: object | null, scan?: object }} [config]
 */
function makeDeps(config = {}) {
  const target = config.target ?? STAGING
  const version = config.version ?? 'v1.2.0-3-g1a2b3c4'
  const calls = []
  const seen = {}
  const record = { builds: [], packaged: [], disposed: 0, uploads: [], confirms: [], logs: [] }
  const deps = {
    now: () => new Date(config.now ?? '2026-11-11T16:00:00Z'), // 23:00 in Jakarta
    log: (line) => record.logs.push(line),
    git: { describe: () => version, exactTag: () => config.exactTag ?? null, isDirty: () => config.dirty ?? false },
    build: (clientId) => {
      record.builds.push(clientId)
      return config.buildOk ?? true
    },
    readBuildInfo: () => (config.buildInfo === undefined ? { version, clientId: target.clientId } : config.buildInfo),
    scanBundle: () => config.scan ?? { problems: [], files: 163 },
    packageRelease: (name) => {
      record.packaged.push(name)
      return { archive: `/tmp/${name}.tgz`, sizeBytes: 5 * 1024 * 1024, dispose: () => record.disposed++ }
    },
    transport: {
      run: (argv, options = {}) => {
        const call = { argv, cwd: options.cwd }
        calls.push(call)
        const kind = kindOf(call)
        seen[kind] = (seen[kind] ?? 0) + 1
        return config.answer?.(call, seen[kind]) ?? defaultAnswer(call)
      },
      upload: (localFile, remoteFile) => {
        record.uploads.push({ localFile, remoteFile })
        return { code: config.uploadCode ?? 0, stdout: '', stderr: '' }
      },
    },
    confirm: async (input) => {
      record.confirms.push(input)
      return config.confirmed ?? true
    },
  }
  return { deps, calls, kinds: () => calls.map(kindOf), record, text: () => record.logs.join('\n') }
}

const FULL_SEQUENCE = [
  'check-folder',
  'check-env-file',
  'lock',
  'mkdir-incoming',
  'mkdir-temp',
  'untar',
  'rename',
  'rm-archive',
  'doctor',
  'npm-ci',
  'env-check',
  'migrate',
  'activate',
  'restart',
  'health',
  'cleanup',
  'unlock',
]

describe('runDeploy: a good deploy', () => {
  it('does every step in order, to staging', async () => {
    const { deps, kinds, record, calls } = makeDeps()
    const result = await runDeploy({ target: STAGING, deps })
    expect(result).toMatchObject({ ok: true, status: 'deployed', version: 'v1.2.0-3-g1a2b3c4' })
    expect(result.release).toMatch(/^20261111160000-v1\.2\.0-3-g1a2b3c4$/)
    expect(kinds()).toEqual(FULL_SEQUENCE)
    expect(record.builds).toEqual(['acme-staging'])
    expect(record.packaged).toEqual([result.release])
    expect(record.disposed).toBe(1)
    expect(record.confirms).toEqual([])
    expect(record.uploads).toEqual([
      {
        localFile: `/tmp/${result.release}.tgz`,
        remoteFile: `${ROOT_STAGING}/releases/.incoming/${result.release}.tgz`,
      },
    ])
    const health = calls.find((call) => kindOf(call) === 'health')
    expect(health.argv).toContain('--version')
    expect(health.argv[health.argv.indexOf('--version') + 1]).toBe('v1.2.0-3-g1a2b3c4')
    expect(health.argv).toContain('http://127.0.0.1:5205/oxy-acme-staging-finance-dashboard/health')
    expect(calls.find((call) => kindOf(call) === 'migrate').argv).toContain(
      `--env-file=${ROOT_STAGING}/finance-dashboard.env`,
    )
    expect(calls.find((call) => kindOf(call) === 'restart').argv).toEqual([
      'sudo',
      '-n',
      'systemctl',
      'restart',
      'oxy-finance-dashboard@acme-staging-finance-dashboard-5205',
    ])
    expect(calls.find((call) => kindOf(call) === 'cleanup').argv).toContain('5')
  })

  it('asks for confirmation before production, and then does the same steps', async () => {
    const { deps, kinds, record } = makeDeps({ target: PRODUCTION, version: 'v1.2.0', exactTag: 'v1.2.0' })
    const result = await runDeploy({ target: PRODUCTION, deps })
    expect(result.status).toBe('deployed')
    expect(record.confirms).toHaveLength(1)
    expect(record.confirms[0].expected).toBe('acme-production')
    expect(record.builds).toEqual(['acme'])
    expect(kinds()).toEqual(FULL_SEQUENCE)
  })

  it('does not ask when --yes is given', async () => {
    const { deps, record } = makeDeps({ target: PRODUCTION, version: 'v1.2.0', exactTag: 'v1.2.0' })
    await runDeploy({ target: PRODUCTION, options: { yes: true }, deps })
    expect(record.confirms).toEqual([])
  })

  it('uses the existing build with --skip-build, and keeps the number of releases it is told to', async () => {
    const { deps, record, calls } = makeDeps()
    const result = await runDeploy({ target: STAGING, options: { skipBuild: true, keep: 8 }, deps })
    expect(result.status).toBe('deployed')
    expect(record.builds).toEqual([])
    expect(calls.find((call) => call.argv.includes('cleanup')).argv).toContain('8')
  })

  it('is still deployed when the clean-up fails', async () => {
    const { deps } = makeDeps({
      answer: (call) => (kindOf(call) === 'cleanup' ? { code: 1, stdout: '', stderr: 'oops' } : undefined),
    })
    expect((await runDeploy({ target: STAGING, deps })).status).toBe('deployed')
  })
})

describe('runDeploy: refused before anything is changed', () => {
  async function refused(config, options) {
    const made = makeDeps(config)
    const result = await runDeploy({ target: config?.target ?? STAGING, options, deps: made.deps })
    expect(result).toMatchObject({ ok: false, status: 'failed' })
    expect(made.calls).toEqual([])
    expect(made.record.uploads).toEqual([])
    return made.text()
  }

  it('refuses production outside the window, and allows it with --force-window', async () => {
    const config = { target: PRODUCTION, version: 'v1.2.0', exactTag: 'v1.2.0', now: '2026-11-11T05:00:00Z' } // 12:00 in Jakarta
    expect(await refused(config, { yes: true })).toContain(
      'production is deployed only from 22:00 to 05:00 (Asia/Jakarta)',
    )
    const forced = makeDeps(config)
    const result = await runDeploy({ target: PRODUCTION, options: { forceWindow: true, yes: true }, deps: forced.deps })
    expect(result.status).toBe('deployed')
    expect(forced.text()).toContain('WARNING: outside the deploy window')
  })

  it('refuses production that is not on a tag, and a dirty tree', async () => {
    expect(await refused({ target: PRODUCTION, version: '1a2b3c4', exactTag: null }, { yes: true })).toContain(
      'production is released from a tag',
    )
    expect(await refused({ version: '1a2b3c4-dirty', dirty: true })).toContain('uncommitted changes')
  })

  it('allows a dirty tree for staging only with --allow-dirty', async () => {
    const config = { version: '1a2b3c4-dirty', dirty: true }
    await refused(config)
    const made = makeDeps(config)
    expect((await runDeploy({ target: STAGING, options: { allowDirty: true }, deps: made.deps })).status).toBe(
      'deployed',
    )
  })

  it('stops when the person does not confirm production', async () => {
    const config = { target: PRODUCTION, version: 'v1.2.0', exactTag: 'v1.2.0', confirmed: false }
    expect(await refused(config)).toContain('cancelled; nothing was changed')
  })

  it('refuses a build for another client, another version, and a build that would not run', async () => {
    expect(await refused({ buildInfo: { version: 'v1.2.0-3-g1a2b3c4', clientId: 'other' } })).toContain(
      'made for CLIENT_ID "other"',
    )
    expect(await refused({ buildInfo: { version: 'v0.9.0', clientId: 'acme-staging' } })).toContain(
      'the build says version "v0.9.0"',
    )
    expect(await refused({ buildInfo: null })).toContain('dist/build-info.json is missing')
    expect(await refused({ scan: { problems: ['dist/server/a.js imports "tsx"'], files: 3 } })).toContain(
      'the build would not run on the server',
    )
    expect(await refused({ buildOk: false })).toContain('the build failed')
  })
})

describe('runDeploy: the server is not ready', () => {
  it('says so when the folder or the environment file is missing, and takes no lock', async () => {
    const noFolder = makeDeps({
      answer: (call) => (kindOf(call) === 'check-folder' ? { code: 1, stdout: '', stderr: '' } : undefined),
    })
    expect((await runDeploy({ target: STAGING, deps: noFolder.deps })).status).toBe('failed')
    expect(noFolder.text()).toContain('does not exist on the server')
    expect(noFolder.kinds()).toEqual(['check-folder'])

    const noEnv = makeDeps({
      answer: (call) => (kindOf(call) === 'check-env-file' ? { code: 1, stdout: '', stderr: '' } : undefined),
    })
    await runDeploy({ target: STAGING, deps: noEnv.deps })
    expect(noEnv.text()).toContain('--prepare-only')
    expect(noEnv.kinds()).toEqual(['check-folder', 'check-env-file'])
  })

  it('explains an ssh failure', async () => {
    const down = makeDeps({ answer: () => ({ code: 255, stdout: '', stderr: 'Connection refused' }) })
    await runDeploy({ target: STAGING, deps: down.deps })
    expect(down.text()).toContain('cannot reach the server')
    expect(down.text()).toContain('! Connection refused')
  })

  it('does not release a lock it did not take', async () => {
    const held = makeDeps({
      answer: (call) => (kindOf(call) === 'lock' ? { code: 1, stdout: '', stderr: 'File exists' } : undefined),
    })
    const result = await runDeploy({ target: STAGING, deps: held.deps })
    expect(result.status).toBe('failed')
    expect(held.text()).toContain('another deploy is running')
    expect(held.kinds()).toEqual(['check-folder', 'check-env-file', 'lock'])
    expect(held.record.uploads).toEqual([])
    expect(held.record.disposed).toBe(1)
  })
})

describe('runDeploy: a step on the server fails before the switch', () => {
  async function failsAt(kind) {
    const made = makeDeps({
      answer: (call) => (kindOf(call) === kind ? { code: 1, stdout: '', stderr: 'it broke' } : undefined),
    })
    const result = await runDeploy({ target: STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: false, status: 'failed' })
    expect(made.kinds()).not.toContain('activate')
    expect(made.kinds()).not.toContain('restart')
    expect(made.kinds().at(-1)).toBe('unlock')
    return made
  }

  it('stops, removes the unused release and releases the lock when npm ci, env-check or the migration fails', async () => {
    for (const kind of ['npm-ci', 'env-check', 'migrate', 'doctor']) {
      const made = await failsAt(kind)
      expect(made.kinds().at(-2)).toBe('rm-release')
      expect(made.text()).toContain('! it broke')
    }
  })

  it('does not try to remove a release that was never unpacked, when the upload fails', async () => {
    const made = makeDeps({ uploadCode: 255 })
    const result = await runDeploy({ target: STAGING, deps: made.deps })
    expect(result.status).toBe('failed')
    expect(made.text()).toContain('the upload failed (exit code 255)')
    expect(made.kinds()).toEqual(['check-folder', 'check-env-file', 'lock', 'mkdir-incoming', 'unlock'])
  })
})

describe('runDeploy: the new release is not healthy', () => {
  it('goes back to the previous release', async () => {
    const made = makeDeps({
      answer: (call, count) =>
        kindOf(call) === 'health' && count === 1 ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined,
    })
    const result = await runDeploy({ target: STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: false, status: 'rolled-back' })
    expect(made.kinds().slice(12)).toEqual([
      'activate',
      'restart',
      'health',
      'rollback',
      'list-json',
      'restart',
      'health',
      'unlock',
    ])
    expect(made.text()).toContain('ROLLED BACK: v1.2.0-3-g1a2b3c4 was not healthy')
    expect(made.text()).toContain('(v1.0.0) is running again')
    const secondHealth = made.calls.filter((call) => kindOf(call) === 'health')[1]
    expect(secondHealth.argv[secondHealth.argv.indexOf('--version') + 1]).toBe('v1.0.0')
  })

  it('treats a service that cannot be restarted the same way', async () => {
    const made = makeDeps({
      answer: (call, count) =>
        kindOf(call) === 'restart' && count === 1
          ? { code: 1, stdout: '', stderr: 'sudo: a password is required' }
          : undefined,
    })
    const result = await runDeploy({ target: STAGING, deps: made.deps })
    expect(result.status).toBe('rolled-back')
    expect(made.text()).toContain('could not be restarted')
    expect(made.kinds()).not.toContain('cleanup')
  })

  it('leaves the service as it is when there is nothing to go back to', async () => {
    const made = makeDeps({
      answer: (call) => {
        if (kindOf(call) === 'activate') return { code: 0, stdout: 'activated new\nprevious none\n', stderr: '' }
        if (kindOf(call) === 'health') return { code: 1, stdout: '', stderr: 'FAILED' }
        return undefined
      },
    })
    const result = await runDeploy({ target: STAGING, deps: made.deps })
    expect(result.status).toBe('failed')
    expect(made.text()).toContain('there is no previous release to go back to')
    expect(made.kinds()).not.toContain('rollback')
    expect(made.kinds().at(-1)).toBe('unlock')
  })

  it('asks for a person when the previous release is not healthy either, or cannot be switched back', async () => {
    const bothBad = makeDeps({
      answer: (call) => (kindOf(call) === 'health' ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined),
    })
    expect((await runDeploy({ target: STAGING, deps: bothBad.deps })).status).toBe('rollback-failed')
    expect(bothBad.text()).toContain('ACTION NEEDED: the previous release does not answer either')

    const noSwitch = makeDeps({
      answer: (call) => {
        if (kindOf(call) === 'health') return { code: 1, stdout: '', stderr: 'FAILED' }
        if (kindOf(call) === 'rollback') return { code: 1, stdout: '', stderr: 'release: gone' }
        return undefined
      },
    })
    expect((await runDeploy({ target: STAGING, deps: noSwitch.deps })).status).toBe('rollback-failed')
    expect(noSwitch.text()).toContain('ACTION NEEDED: the new release is not healthy and the switch back failed')
  })
})

describe('runDeploy: first deploy and dry run', () => {
  it('only prepares with --prepare-only: no environment file needed, nothing switched', async () => {
    const made = makeDeps()
    const result = await runDeploy({ target: STAGING, options: { prepareOnly: true }, deps: made.deps })
    expect(result).toMatchObject({ ok: true, status: 'prepared' })
    expect(made.kinds()).toEqual([
      'check-folder',
      'lock',
      'mkdir-incoming',
      'mkdir-temp',
      'untar',
      'rename',
      'rm-archive',
      'npm-ci',
      'unlock',
    ])
    expect(made.text()).toContain('init-env.mjs create --client acme --env staging --port 5205')
  })

  it('does not build, package, upload or run anything with --dry-run', async () => {
    const made = makeDeps({ target: PRODUCTION, version: 'v1.2.0', exactTag: 'v1.2.0' })
    const result = await runDeploy({ target: PRODUCTION, options: { dryRun: true }, deps: made.deps })
    expect(result).toMatchObject({ ok: true, status: 'dry-run' })
    expect(made.calls).toEqual([])
    expect(made.record.builds).toEqual([])
    expect(made.record.packaged).toEqual([])
    expect(made.record.uploads).toEqual([])
    expect(made.record.confirms).toEqual([])
    expect(made.text()).toContain('(dry run) would run:')
    expect(made.text()).toContain('DRY RUN finished')
  })

  it('still applies the rules in a dry run', async () => {
    const made = makeDeps({ target: PRODUCTION, version: '1a2b3c4', exactTag: null })
    expect((await runDeploy({ target: PRODUCTION, options: { dryRun: true }, deps: made.deps })).status).toBe('failed')
  })
})

describe('runRollback', () => {
  it('switches back, restarts and checks the health of the old version', async () => {
    const made = makeDeps()
    const result = await runRollback({ target: STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: true, status: 'rolled-back', release: PREVIOUS, version: 'v1.0.0' })
    expect(made.kinds()).toEqual(['check-current', 'lock', 'rollback', 'list-json', 'restart', 'health', 'unlock'])
    expect(made.calls.find((call) => kindOf(call) === 'rollback').cwd).toBe(`${ROOT_STAGING}/current`)
  })

  it('asks for confirmation for production', async () => {
    const made = makeDeps({ target: PRODUCTION, confirmed: false })
    const result = await runRollback({ target: PRODUCTION, deps: made.deps })
    expect(result.status).toBe('failed')
    expect(made.calls).toEqual([])
    expect(made.record.confirms[0].expected).toBe('acme-production')
  })

  it('fails clearly when nothing is installed, when the lock is held, or there is no previous release', async () => {
    const empty = makeDeps({
      answer: (call) => (kindOf(call) === 'check-current' ? { code: 1, stdout: '', stderr: '' } : undefined),
    })
    expect((await runRollback({ target: STAGING, deps: empty.deps })).status).toBe('failed')
    expect(empty.text()).toContain('no release is installed on this server yet')

    const held = makeDeps({
      answer: (call) => (kindOf(call) === 'lock' ? { code: 1, stdout: '', stderr: '' } : undefined),
    })
    await runRollback({ target: STAGING, deps: held.deps })
    expect(held.kinds()).toEqual(['check-current', 'lock'])

    const none = makeDeps({
      answer: (call) =>
        kindOf(call) === 'rollback'
          ? { code: 1, stdout: '', stderr: 'release: there is no previous release' }
          : undefined,
    })
    expect((await runRollback({ target: STAGING, deps: none.deps })).status).toBe('failed')
    expect(none.kinds().at(-1)).toBe('unlock')
  })

  it('asks for a person when the old release is not healthy', async () => {
    const made = makeDeps({
      answer: (call) => (kindOf(call) === 'health' ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined),
    })
    expect((await runRollback({ target: STAGING, deps: made.deps })).status).toBe('rollback-failed')
  })
})

describe('runStatus', () => {
  it('lists the releases and asks the health address once', async () => {
    const made = makeDeps()
    const result = await runStatus({ target: STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: true, version: 'v1.0.0' })
    expect(made.kinds()).toEqual(['check-current', 'list', 'health', 'list-json'])
    expect(made.calls.find((call) => kindOf(call) === 'health').argv).toContain('--once')
  })

  it('reports an unhealthy deployment and a server with nothing installed', async () => {
    const sick = makeDeps({
      answer: (call) => (kindOf(call) === 'health' ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined),
    })
    expect((await runStatus({ target: STAGING, deps: sick.deps })).ok).toBe(false)
    const empty = makeDeps({
      answer: (call) => (kindOf(call) === 'check-current' ? { code: 1, stdout: '', stderr: '' } : undefined),
    })
    expect((await runStatus({ target: STAGING, deps: empty.deps })).ok).toBe(false)
    expect(empty.text()).toContain('no release is installed')
  })
})
