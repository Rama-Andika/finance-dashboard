import { describe, expect, it } from 'vitest'
import { checkEnvText } from './env-rules.mjs'
import { buildEnvFileText, newSessionSecret, replaceSessionSecret } from './env-template.mjs'

const SECRET = 'b'.repeat(64)

describe('newSessionSecret', () => {
  it('is 64 hexadecimal characters and different every time', () => {
    const first = newSessionSecret()
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(newSessionSecret()).not.toBe(first)
  })
})

describe('buildEnvFileText', () => {
  it('writes a production file that is complete except for the database address', () => {
    const text = buildEnvFileText({ client: 'acme', env: 'production', port: 5105, secret: SECRET })
    expect(text.endsWith('\n')).toBe(true)
    expect(text).not.toContain('\r')
    const result = checkEnvText(text, { folderName: 'oxy-acme-production-finance-dashboard-5105' })
    expect(result.problems).toEqual(['DATABASE_URL: missing or empty'])
    expect(result.notes).toEqual([])
    expect(text).toContain('CLIENT_ID=acme\n')
  })

  it('writes a staging file whose CLIENT_ID ends with -staging', () => {
    const text = buildEnvFileText({ client: 'acme', env: 'staging', port: 5205, secret: SECRET })
    expect(text).toContain('CLIENT_ID=acme-staging\n')
    expect(checkEnvText(text, { folderName: 'oxy-acme-staging-finance-dashboard-5205' }).problems).toEqual([
      'DATABASE_URL: missing or empty',
    ])
  })

  it('is accepted once the database address is filled in', () => {
    const text = buildEnvFileText({ client: 'acme', env: 'staging', port: 5205, secret: SECRET }).replace(
      'DATABASE_URL=',
      'DATABASE_URL=mysql://user:pass@127.0.0.1:3310/acme_trial',
    )
    expect(checkEnvText(text, { folderName: 'oxy-acme-staging-finance-dashboard-5205' }).problems).toEqual([])
  })

  it('leaves the migrations to the installer', () => {
    const text = buildEnvFileText({ client: 'acme', env: 'production', port: 5105, secret: SECRET })
    expect(text).toContain('AUTO_MIGRATE=0\n')
    expect(text).not.toContain('AUTO_MIGRATE=1')
  })

  it('uses the time zone it is given', () => {
    const text = buildEnvFileText({
      client: 'acme',
      env: 'staging',
      port: 5205,
      secret: SECRET,
      timezone: 'Asia/Makassar',
    })
    expect(text).toContain('TZ=Asia/Makassar\n')
    expect(text).toContain('APP_TIMEZONE=Asia/Makassar\n')
  })

  it('refuses input that would make a wrong file', () => {
    const ok = { client: 'acme', env: 'staging', port: 5205, secret: SECRET }
    expect(() => buildEnvFileText({ ...ok, client: 'Acme Corp' })).toThrow('client')
    expect(() => buildEnvFileText({ ...ok, env: 'development' })).toThrow('env')
    expect(() => buildEnvFileText({ ...ok, port: 80 })).toThrow('port')
    expect(() => buildEnvFileText({ ...ok, port: 52.5 })).toThrow('port')
    expect(() => buildEnvFileText({ ...ok, secret: 'short' })).toThrow('secret')
    expect(() => buildEnvFileText({ ...ok, timezone: 'Mars/Base' })).toThrow('timezone')
  })
})

describe('replaceSessionSecret', () => {
  const text = buildEnvFileText({ client: 'acme', env: 'staging', port: 5205, secret: SECRET })

  it('changes only the value of the SESSION_SECRET line', () => {
    const next = replaceSessionSecret(text, 'c'.repeat(64))
    expect(next).toContain(`SESSION_SECRET=${'c'.repeat(64)}\n`)
    expect(next).not.toContain(SECRET)
    expect(next.replace('c'.repeat(64), SECRET)).toBe(text)
  })

  it('keeps Windows line endings', () => {
    const next = replaceSessionSecret(text.replace(/\n/g, '\r\n'), 'c'.repeat(64))
    expect(next).toContain(`SESSION_SECRET=${'c'.repeat(64)}\r\n`)
  })

  it('does not touch a comment that mentions SESSION_SECRET', () => {
    const withComment = `# SESSION_SECRET=old-value-in-a-comment\n${text}`
    expect(replaceSessionSecret(withComment, 'c'.repeat(64))).toContain('# SESSION_SECRET=old-value-in-a-comment')
  })

  it('refuses a file with no SESSION_SECRET line or with two', () => {
    expect(() => replaceSessionSecret('A=1\n', 'x')).toThrow('found 0')
    expect(() => replaceSessionSecret('SESSION_SECRET=a\nSESSION_SECRET=b\n', 'x')).toThrow('found 2')
  })
})
