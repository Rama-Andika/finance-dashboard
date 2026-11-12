import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTargets } from './targets.mjs'

const STAGING_ROOT = '/home/oxy/web-server/oxy-acme-staging-finance-dashboard-5205'

function one(overrides = {}) {
  return JSON.stringify({
    'acme-staging': { ssh: 'oxy@staging.example.com', root: STAGING_ROOT, timezone: 'Asia/Jakarta', ...overrides },
  })
}

describe('parseTargets', () => {
  it('reads a target and fills in what the folder name says', () => {
    const { targets, problems } = parseTargets(one())
    expect(problems).toEqual([])
    expect(targets).toEqual([
      {
        name: 'acme-staging',
        ssh: 'oxy@staging.example.com',
        sshPort: 22,
        root: STAGING_ROOT,
        timezone: 'Asia/Jakarta',
        nodePath: '/usr/bin/node',
        npmPath: '/usr/bin/npm',
        client: 'acme',
        env: 'staging',
        port: 5205,
        clientId: 'acme-staging',
        unit: 'oxy-finance-dashboard@acme-staging-finance-dashboard-5205',
      },
    ])
  })

  it('accepts the example file that ships with the repository', () => {
    const text = readFileSync(join(import.meta.dirname, 'targets.example.json'), 'utf8')
    const { targets, problems } = parseTargets(text)
    expect(problems).toEqual([])
    expect(targets.map((target) => [target.name, target.env, target.clientId])).toEqual([
      ['acme-staging', 'staging', 'acme-staging'],
      ['acme-production', 'production', 'acme'],
    ])
  })

  it('names the target and the field of each problem', () => {
    const cases = [
      [{ ssh: 'staging.example.com' }, 'target "acme-staging": ssh must look like user@host'],
      [{ ssh: 'root@host; rm -rf /' }, 'target "acme-staging": ssh must look like user@host'],
      [{ sshPort: 0 }, 'target "acme-staging": sshPort must be a whole number from 1 to 65535'],
      [{ sshPort: '22' }, 'target "acme-staging": sshPort must be a whole number from 1 to 65535'],
      [
        { timezone: undefined },
        'target "acme-staging": timezone is required and must be a time zone name such as Asia/Jakarta',
      ],
      [
        { timezone: 'Mars/Base' },
        'target "acme-staging": timezone is required and must be a time zone name such as Asia/Jakarta',
      ],
      [{ nodePath: 'node' }, 'target "acme-staging": nodePath must be a plain absolute path'],
      [
        { root: 'relative/oxy-acme-staging-finance-dashboard-5205' },
        'target "acme-staging": root must be a plain absolute path',
      ],
      [
        { root: '/home/oxy/web-server/acme' },
        'target "acme-staging": the last part of root must be oxy-<client>-<env>-finance-dashboard-<port>',
      ],
      [
        { root: '/home/oxy/web-server/oxy-acme-production-finance-dashboard-5105' },
        'target "acme-staging": the name must be acme-production, as the folder name says',
      ],
      [{ extra: 1 }, 'target "acme-staging": unknown field "extra"'],
    ]
    for (const [overrides, message] of cases) {
      const { targets, problems } = parseTargets(one(overrides))
      expect(problems, JSON.stringify(overrides)).toEqual([message])
      expect(targets).toEqual([])
    }
  })

  it('refuses a file that is not a list of targets', () => {
    expect(parseTargets('nonsense').problems).toEqual(['the targets file is not valid JSON'])
    expect(parseTargets('[]').problems).toEqual(['the targets file must be a JSON object with one entry per target'])
    expect(parseTargets('{}').problems).toEqual(['the targets file has no targets'])
    expect(parseTargets('{"Bad Name":{}}').problems).toEqual([
      'target "Bad Name": the name must be lowercase letters, digits and dashes',
    ])
    expect(parseTargets('{"acme-staging":5}').problems).toEqual(['target "acme-staging": must be an object'])
  })

  it('keeps the good targets and reports the bad one', () => {
    const text = JSON.stringify({
      'acme-staging': { ssh: 'oxy@staging.example.com', root: STAGING_ROOT, timezone: 'Asia/Jakarta' },
      'acme-production': {
        ssh: 'nope',
        root: '/home/oxy/web-server/oxy-acme-production-finance-dashboard-5105',
        timezone: 'Asia/Jakarta',
      },
    })
    const { targets, problems } = parseTargets(text)
    expect(targets.map((target) => target.name)).toEqual(['acme-staging'])
    expect(problems).toEqual(['target "acme-production": ssh must look like user@host'])
  })
})
