import { describe, expect, it } from 'vitest'
import { runPackage } from './package-flow.mjs'

/** Deps with everything recorded. */
function makeDeps(config = {}) {
  const version = config.version ?? 'v1.2.0'
  const record = { builds: [], packaged: [], logs: [] }
  const deps = {
    now: () => new Date('2026-11-12T10:00:00Z'),
    log: (line) => record.logs.push(line),
    git: { describe: () => version, isDirty: () => config.dirty ?? false },
    build: (clientId) => {
      record.builds.push(clientId)
      return config.buildOk ?? true
    },
    readBuildInfo: () =>
      config.buildInfo === undefined ? { version, clientId: config.clientId ?? 'acme' } : config.buildInfo,
    scanBundle: () => config.scan ?? { problems: [], files: 163 },
    makePackage: (name) => {
      record.packaged.push(name)
      return { file: `/work/release-packages/${name}.tgz`, sizeBytes: 5 * 1024 * 1024 }
    },
  }
  return { deps, record, text: () => record.logs.join('\n') }
}

describe('runPackage: a good package', () => {
  it('builds for the client, checks the build, makes the package and says what to do next', () => {
    const { deps, record, text } = makeDeps()
    const result = runPackage({ client: 'acme', env: 'production', deps })
    expect(result).toEqual({
      ok: true,
      file: '/work/release-packages/20261112100000-v1.2.0.tgz',
      name: '20261112100000-v1.2.0',
      version: 'v1.2.0',
      clientId: 'acme',
    })
    expect(record.builds).toEqual(['acme'])
    expect(record.packaged).toEqual(['20261112100000-v1.2.0'])
    expect(text()).toContain(
      'PACKAGE READY: /work/release-packages/20261112100000-v1.2.0.tgz (5.0 MB), for acme (production), version v1.2.0',
    )
    const root = '/home/oxy/web-server/oxy-acme-production-finance-dashboard-<port>'
    expect(text()).toContain(`mkdir ${root}/releases/20261112100000-v1.2.0`)
    expect(text()).toContain(
      `tar -xzf <upload folder>/20261112100000-v1.2.0.tgz -C ${root}/releases/20261112100000-v1.2.0`,
    )
    expect(text()).toContain(`node ${root}/releases/20261112100000-v1.2.0/scripts/ops/install.mjs`)
    expect(text()).toContain('--prepare-only')
  })

  it('builds staging for the CLIENT_ID with -staging, and does not need a tag', () => {
    const { deps, record } = makeDeps({ version: '1a2b3c4', clientId: 'acme-staging' })
    const result = runPackage({ client: 'acme', env: 'staging', deps })
    expect(result).toMatchObject({ ok: true, clientId: 'acme-staging', name: '20261112100000-1a2b3c4' })
    expect(record.builds).toEqual(['acme-staging'])
  })

  it('uses the existing build with --skip-build', () => {
    const { deps, record } = makeDeps()
    expect(runPackage({ client: 'acme', env: 'production', options: { skipBuild: true }, deps }).ok).toBe(true)
    expect(record.builds).toEqual([])
  })
})

describe('runPackage: refused', () => {
  function refused(input, config) {
    const made = makeDeps(config)
    const result = runPackage({ ...input, deps: made.deps })
    expect(result.ok).toBe(false)
    expect(made.record.packaged).toEqual([])
    return made
  }

  it('refuses a wrong client or environment before building anything', () => {
    expect(refused({ client: 'Acme Corp', env: 'production' }).text()).toContain('the client must be lowercase letters')
    const wrongEnv = refused({ client: 'acme', env: 'development' })
    expect(wrongEnv.text()).toContain('the environment must be staging or production')
    expect(wrongEnv.record.builds).toEqual([])
  })

  it('refuses uncommitted changes, and allows them only for staging with --allow-dirty', () => {
    const config = { dirty: true, version: '1a2b3c4-dirty', clientId: 'acme-staging' }
    const made = refused({ client: 'acme', env: 'staging' }, config)
    expect(made.text()).toContain('uncommitted changes')
    expect(made.record.builds).toEqual([])

    const allowed = makeDeps(config)
    expect(runPackage({ client: 'acme', env: 'staging', options: { allowDirty: true }, deps: allowed.deps }).ok).toBe(
      true,
    )
    refused(
      { client: 'acme', env: 'production', options: { allowDirty: true } },
      { dirty: true, version: '1a2b3c4-dirty' },
    )
  })

  it('refuses a build for another client, another version, no build info, or a build that would not run', () => {
    expect(refused({ client: 'acme', env: 'production' }, { clientId: 'other' }).text()).toContain(
      'made for CLIENT_ID "other"',
    )
    expect(
      refused({ client: 'acme', env: 'production' }, { buildInfo: { version: 'v0.9.0', clientId: 'acme' } }).text(),
    ).toContain('the build says version "v0.9.0"')
    expect(refused({ client: 'acme', env: 'production' }, { buildInfo: null }).text()).toContain(
      'dist/build-info.json is missing',
    )
    expect(
      refused(
        { client: 'acme', env: 'production' },
        { scan: { problems: ['dist/server/a.js imports "tsx"'], files: 3 } },
      ).text(),
    ).toContain('the build would not run on the server')
    expect(refused({ client: 'acme', env: 'production' }, { buildOk: false }).text()).toContain('the build failed')
  })

  it('refuses a build for staging that was left in dist/ when packaging production with --skip-build', () => {
    const made = refused(
      { client: 'acme', env: 'production', options: { skipBuild: true } },
      { buildInfo: { version: 'v1.2.0', clientId: 'acme-staging' } },
    )
    expect(made.text()).toContain('made for CLIENT_ID "acme-staging" but this package needs "acme"')
  })
})
