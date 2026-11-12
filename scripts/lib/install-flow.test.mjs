import { describe, expect, it } from 'vitest'
import { locateRelease, runInstall, runRollback, runStatus } from './install-flow.mjs'

const ROOT_STAGING = '/home/oxy/web-server/oxy-acme-staging-finance-dashboard-5205'
const ROOT_PRODUCTION = '/home/oxy/web-server/oxy-acme-production-finance-dashboard-5105'
const NAME = '20261111160000-v1.2.0'
const PREVIOUS = '20261101000000-v1.0.0'
const STAGING = locateRelease(`${ROOT_STAGING}/releases/${NAME}`).place
const PRODUCTION = locateRelease(`${ROOT_PRODUCTION}/releases/${NAME}`).place
const OK = { code: 0, stdout: '', stderr: '' }

/** A short name for what a command does, so that a test can compare the order of steps. */
function kindOf({ argv }) {
  const joined = argv.join(' ')
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
  if (kind === 'activate') return { code: 0, stdout: `activated ${NAME}\nprevious ${PREVIOUS}\n`, stderr: '' }
  if (kind === 'rollback') return { code: 0, stdout: `rolled back to ${PREVIOUS}\nfrom ${NAME}\n`, stderr: '' }
  if (kind === 'list-json') {
    return {
      code: 0,
      stdout: JSON.stringify({ current: PREVIOUS, previous: NAME, releases: [{ name: PREVIOUS, version: 'v1.0.0' }] }),
      stderr: '',
    }
  }
  return OK
}

/**
 * Deps with everything recorded. `answer(call, count)` may return a result for a command; undefined means the default answer.
 * @param {{ place?: object, buildInfo?: object | null, envFile?: boolean, lockFree?: boolean, answer?: Function }} [config]
 */
function makeDeps(config = {}) {
  const place = config.place ?? STAGING
  const events = []
  const seen = {}
  const calls = []
  const logs = []
  const deps = {
    now: () => new Date('2026-11-11T16:00:00Z'),
    log: (line) => logs.push(line),
    run: (argv, options = {}) => {
      const call = { argv, cwd: options.cwd }
      calls.push(call)
      const kind = kindOf(call)
      events.push(kind)
      seen[kind] = (seen[kind] ?? 0) + 1
      return config.answer?.(call, seen[kind]) ?? defaultAnswer(call)
    },
    exists: (path) => {
      events.push(path.endsWith('finance-dashboard.env') ? 'check-env-file' : 'check-exists')
      return path.endsWith('finance-dashboard.env') ? (config.envFile ?? true) : true
    },
    makeLock: () => {
      events.push('lock')
      return config.lockFree ?? true
    },
    removeLock: () => events.push('unlock'),
    readBuildInfo: () =>
      config.buildInfo === undefined ? { version: 'v1.2.0', clientId: place.folder.clientId } : config.buildInfo,
    refreshOpener: (releaseDir, root) => {
      events.push('refresh-opener')
      calls.push({ argv: ['refreshOpener', releaseDir, root] })
      if (config.openerError) throw new Error(config.openerError)
      return config.opener ?? 'same'
    },
    nodePath: '/usr/bin/node',
    npmPath: 'npm',
  }
  return { deps, events, calls, text: () => logs.join('\n'), place }
}

const FULL_SEQUENCE = [
  'check-env-file',
  'lock',
  'doctor',
  'npm-ci',
  'env-check',
  'migrate',
  'activate',
  'restart',
  'health',
  'cleanup',
  'refresh-opener',
  'unlock',
]

describe('locateRelease', () => {
  it('reads the deployment from the place of the release folder', () => {
    const { place, message } = locateRelease(`${ROOT_PRODUCTION}/releases/${NAME}`)
    expect(message).toBe('')
    expect(place).toMatchObject({
      root: ROOT_PRODUCTION,
      name: NAME,
      releaseDir: `${ROOT_PRODUCTION}/releases/${NAME}`,
      folder: { client: 'acme', env: 'production', port: 5105, clientId: 'acme' },
    })
  })

  it('says what is wrong when the folder is not where a release belongs', () => {
    expect(locateRelease('/home/oxy/code/finance-dashboard').place).toBeNull()
    expect(locateRelease(`${ROOT_STAGING}/releases/not-a-release`).message).toContain('must run from a release folder')
    expect(locateRelease(`${ROOT_STAGING}/${NAME}`).message).toContain('must run from a release folder')
    expect(locateRelease(`/home/oxy/web-server/somewhere/releases/${NAME}`).message).toContain(
      'must be named oxy-<client>-<env>',
    )
  })
})

describe('runInstall: a good install', () => {
  it('does every step in order', () => {
    const { deps, events, calls } = makeDeps()
    const result = runInstall({ place: STAGING, deps })
    expect(result).toEqual({ ok: true, status: 'installed', release: NAME, version: 'v1.2.0' })
    expect(events).toEqual(FULL_SEQUENCE)
    const health = calls.find((call) => kindOf(call) === 'health')
    expect(health.argv[health.argv.indexOf('--version') + 1]).toBe('v1.2.0')
    expect(health.argv).toContain('http://127.0.0.1:5205/oxy-acme-staging-finance-dashboard/health')
    expect(calls.find((call) => kindOf(call) === 'migrate').argv).toContain(
      `--env-file=${ROOT_STAGING}/finance-dashboard.env`,
    )
    expect(calls.find((call) => kindOf(call) === 'migrate').cwd).toBe(`${ROOT_STAGING}/releases/${NAME}`)
    expect(calls.find((call) => kindOf(call) === 'restart').argv).toEqual([
      'sudo',
      '-n',
      'systemctl',
      'restart',
      'oxy-finance-dashboard@acme-staging-finance-dashboard-5205',
    ])
    expect(calls.find((call) => kindOf(call) === 'cleanup').argv).toContain('5')
  })

  it('does the same for production, and keeps the number of releases it is told to', () => {
    const { deps, events, calls } = makeDeps({ place: PRODUCTION })
    expect(runInstall({ place: PRODUCTION, options: { keep: 8 }, deps }).status).toBe('installed')
    expect(events).toEqual(FULL_SEQUENCE)
    expect(calls.find((call) => kindOf(call) === 'cleanup').argv).toContain('8')
    expect(calls.find((call) => kindOf(call) === 'health').argv).toContain(
      'http://127.0.0.1:5105/oxy-acme-finance-dashboard/health',
    )
  })

  it('is still installed when the clean-up fails', () => {
    const { deps } = makeDeps({
      answer: (call) => (kindOf(call) === 'cleanup' ? { code: 1, stdout: '', stderr: 'oops' } : undefined),
    })
    expect(runInstall({ place: STAGING, deps }).status).toBe('installed')
  })

  it('refreshes open-package.mjs in the deploy folder from this release, and says when it changed', () => {
    const same = makeDeps()
    runInstall({ place: STAGING, deps: same.deps })
    expect(same.calls.find((call) => call.argv[0] === 'refreshOpener').argv).toEqual([
      'refreshOpener',
      `${ROOT_STAGING}/releases/${NAME}`,
      ROOT_STAGING,
    ])
    expect(same.text()).not.toContain('open-package.mjs')
    const updated = makeDeps({ opener: 'updated' })
    runInstall({ place: STAGING, deps: updated.deps })
    expect(updated.text()).toContain('open-package.mjs in the deploy folder was updated')
    const added = makeDeps({ opener: 'added' })
    runInstall({ place: STAGING, deps: added.deps })
    expect(added.text()).toContain('open-package.mjs was missing in the deploy folder')
  })

  it('is still installed when open-package.mjs cannot be refreshed, and tells the person', () => {
    const made = makeDeps({ openerError: 'EACCES' })
    expect(runInstall({ place: STAGING, deps: made.deps }).status).toBe('installed')
    expect(made.text()).toContain('Could not refresh open-package.mjs (EACCES)')
  })

  it('does not refresh it when the release is rolled back', () => {
    const made = makeDeps({
      answer: (call) => (kindOf(call) === 'health' ? { code: 1, stdout: '', stderr: 'no' } : undefined),
    })
    expect(runInstall({ place: STAGING, deps: made.deps }).status).not.toBe('installed')
    expect(made.events).not.toContain('refresh-opener')
  })
})

describe('runInstall: refused before anything is changed', () => {
  function refused(config, expectedEvents = []) {
    const made = makeDeps(config)
    const result = runInstall({ place: config?.place ?? STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: false, status: 'failed' })
    expect(made.calls).toEqual([])
    expect(made.events).toEqual(expectedEvents)
    return made.text()
  }

  it('refuses a package that is incomplete, has no version, or was built for another client', () => {
    expect(refused({ buildInfo: null })).toContain('dist/build-info.json is missing')
    expect(refused({ buildInfo: { clientId: 'acme-staging' } })).toContain('has no version')
    expect(refused({ buildInfo: { version: 'v1.2.0', clientId: 'acme' } })).toContain(
      'built for CLIENT_ID "acme" but this deploy folder is for "acme-staging"',
    )
    expect(refused({ place: PRODUCTION, buildInfo: { version: 'v1.2.0', clientId: 'acme-staging' } })).toContain(
      'wrong package or wrong folder',
    )
  })

  it('says so when the environment file is missing, and takes no lock', () => {
    expect(refused({ envFile: false }, ['check-env-file'])).toContain('--prepare-only')
  })

  it('does not release a lock it did not take', () => {
    const text = refused({ lockFree: false }, ['check-env-file', 'lock'])
    expect(text).toContain('another install is running')
    expect(text).toContain('rm -r /home/oxy/web-server/oxy-acme-staging-finance-dashboard-5205/.deploy.lock')
  })
})

describe('runInstall: a step fails before the switch', () => {
  it('stops, keeps the release folder and releases the lock when doctor, npm ci, env-check or the migration fails', () => {
    for (const kind of ['doctor', 'npm-ci', 'env-check', 'migrate']) {
      const made = makeDeps({
        answer: (call) => (kindOf(call) === kind ? { code: 1, stdout: '', stderr: 'it broke' } : undefined),
      })
      const result = runInstall({ place: STAGING, deps: made.deps })
      expect(result).toMatchObject({ ok: false, status: 'failed' })
      expect(made.events).not.toContain('activate')
      expect(made.events).not.toContain('restart')
      expect(made.events.at(-1)).toBe('unlock')
      expect(made.text()).toContain('! it broke')
      expect(made.text()).toContain(
        'The release folder was kept. After fixing the problem, run the same command again.',
      )
    }
  })

  it('names a step that took too long', () => {
    const made = makeDeps({
      answer: (call) => (kindOf(call) === 'npm-ci' ? { code: 124, stdout: '', stderr: '' } : undefined),
    })
    runInstall({ place: STAGING, deps: made.deps })
    expect(made.text()).toContain('(it took too long and was stopped)')
  })
})

describe('runInstall: this release is not healthy', () => {
  it('goes back to the previous release', () => {
    const made = makeDeps({
      answer: (call, count) =>
        kindOf(call) === 'health' && count === 1 ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined,
    })
    const result = runInstall({ place: STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: false, status: 'rolled-back' })
    expect(made.events.slice(6)).toEqual([
      'activate',
      'restart',
      'health',
      'rollback',
      'list-json',
      'restart',
      'health',
      'unlock',
    ])
    expect(made.text()).toContain('ROLLED BACK: v1.2.0 was not healthy')
    expect(made.text()).toContain('(v1.0.0) is running again')
    const secondHealth = made.calls.filter((call) => kindOf(call) === 'health')[1]
    expect(secondHealth.argv[secondHealth.argv.indexOf('--version') + 1]).toBe('v1.0.0')
  })

  it('treats a service that cannot be restarted the same way', () => {
    const made = makeDeps({
      answer: (call, count) =>
        kindOf(call) === 'restart' && count === 1
          ? { code: 1, stdout: '', stderr: 'sudo: a password is required' }
          : undefined,
    })
    expect(runInstall({ place: STAGING, deps: made.deps }).status).toBe('rolled-back')
    expect(made.text()).toContain('could not be restarted')
    expect(made.events).not.toContain('cleanup')
  })

  it('leaves the service as it is when there is nothing to go back to', () => {
    const made = makeDeps({
      answer: (call) => {
        if (kindOf(call) === 'activate') return { code: 0, stdout: `activated ${NAME}\nprevious none\n`, stderr: '' }
        if (kindOf(call) === 'health') return { code: 1, stdout: '', stderr: 'FAILED' }
        return undefined
      },
    })
    expect(runInstall({ place: STAGING, deps: made.deps }).status).toBe('failed')
    expect(made.text()).toContain('there is no previous release to go back to')
    expect(made.events).not.toContain('rollback')
    expect(made.events.at(-1)).toBe('unlock')
  })

  it('asks for a person when the previous release is not healthy either, or cannot be switched back', () => {
    const bothBad = makeDeps({
      answer: (call) => (kindOf(call) === 'health' ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined),
    })
    expect(runInstall({ place: STAGING, deps: bothBad.deps }).status).toBe('rollback-failed')
    expect(bothBad.text()).toContain('ACTION NEEDED: the previous release does not answer either')

    const noSwitch = makeDeps({
      answer: (call) => {
        if (kindOf(call) === 'health') return { code: 1, stdout: '', stderr: 'FAILED' }
        if (kindOf(call) === 'rollback') return { code: 1, stdout: '', stderr: 'release: gone' }
        return undefined
      },
    })
    expect(runInstall({ place: STAGING, deps: noSwitch.deps }).status).toBe('rollback-failed')
    expect(noSwitch.text()).toContain('ACTION NEEDED: this release is not healthy and the switch back failed')
  })
})

describe('runInstall: first install and dry run', () => {
  it('only prepares with --prepare-only: no environment file needed, nothing switched', () => {
    const made = makeDeps({ envFile: false })
    const result = runInstall({ place: STAGING, options: { prepareOnly: true }, deps: made.deps })
    expect(result).toMatchObject({ ok: true, status: 'prepared' })
    expect(made.events).toEqual(['lock', 'npm-ci', 'refresh-opener', 'unlock'])
    expect(made.text()).toContain('init-env.mjs create --client acme --env staging --port 5205')
    expect(made.text()).toContain(`${ROOT_STAGING}/releases/${NAME}/scripts/ops/install.mjs`)
  })

  it('does not run anything or take a lock with --dry-run', () => {
    const made = makeDeps({ place: PRODUCTION })
    const result = runInstall({ place: PRODUCTION, options: { dryRun: true }, deps: made.deps })
    expect(result).toMatchObject({ ok: true, status: 'dry-run' })
    expect(made.calls).toEqual([])
    expect(made.events).toEqual(['check-env-file'])
    expect(made.text()).toContain('(dry run) would run:')
    expect(made.text()).toContain('DRY RUN finished')
  })

  it('still checks the release in a dry run', () => {
    const made = makeDeps({ buildInfo: { version: 'v1.2.0', clientId: 'other' } })
    expect(runInstall({ place: STAGING, options: { dryRun: true }, deps: made.deps }).status).toBe('failed')
  })
})

describe('runRollback', () => {
  it('switches back, restarts and checks the health of the old version', () => {
    const made = makeDeps()
    const result = runRollback({ place: STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: true, status: 'rolled-back', release: PREVIOUS, version: 'v1.0.0' })
    expect(made.events).toEqual(['lock', 'rollback', 'list-json', 'restart', 'health', 'unlock'])
  })

  it('fails clearly when the lock is held or there is no previous release', () => {
    const held = makeDeps({ lockFree: false })
    expect(runRollback({ place: STAGING, deps: held.deps }).status).toBe('failed')
    expect(held.events).toEqual(['lock'])

    const none = makeDeps({
      answer: (call) =>
        kindOf(call) === 'rollback'
          ? { code: 1, stdout: '', stderr: 'release: there is no previous release' }
          : undefined,
    })
    expect(runRollback({ place: STAGING, deps: none.deps }).status).toBe('failed')
    expect(none.events.at(-1)).toBe('unlock')
  })

  it('asks for a person when the old release is not healthy', () => {
    const made = makeDeps({
      answer: (call) => (kindOf(call) === 'health' ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined),
    })
    expect(runRollback({ place: STAGING, deps: made.deps }).status).toBe('rollback-failed')
  })

  it('does nothing with --dry-run', () => {
    const made = makeDeps()
    expect(runRollback({ place: STAGING, options: { dryRun: true }, deps: made.deps })).toMatchObject({
      ok: true,
      status: 'dry-run',
    })
    expect(made.calls).toEqual([])
    expect(made.events).toEqual([])
  })
})

describe('runStatus', () => {
  it('lists the releases and asks the health address once', () => {
    const made = makeDeps()
    const result = runStatus({ place: STAGING, deps: made.deps })
    expect(result).toMatchObject({ ok: true, version: 'v1.0.0' })
    expect(made.events).toEqual(['check-exists', 'list', 'health', 'list-json'])
    expect(made.calls.find((call) => kindOf(call) === 'health').argv).toContain('--once')
  })

  it('reports an unhealthy deployment', () => {
    const made = makeDeps({
      answer: (call) => (kindOf(call) === 'health' ? { code: 1, stdout: '', stderr: 'FAILED' } : undefined),
    })
    expect(runStatus({ place: STAGING, deps: made.deps }).ok).toBe(false)
  })
})
