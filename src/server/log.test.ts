import { afterEach, describe, expect, it } from 'vitest'
import { createLogger, errorText } from './log'
import { captureLogs, resetLoggerForTests } from './logging/logger-core'

afterEach(() => resetLoggerForTests())

describe('errorText', () => {
  it('uses the message of an Error and the text of anything else', () => {
    expect(errorText(new Error('boom'))).toBe('boom')
    expect(errorText('plain')).toBe('plain')
    expect(errorText(42)).toBe('42')
    expect(errorText(undefined)).toBe('undefined')
  })
})

describe('createLogger', () => {
  it('writes the scope, the fields and the message as one JSON object', () => {
    const capture = captureLogs()
    createLogger('dash').info({ durationMs: 5 }, 'built')
    createLogger('dash').warn({}, 'pending')
    createLogger().error({ err: new Error('db down') }, 'query failed')
    const entries = capture.entries()
    capture.stop()
    expect(entries[0]).toMatchObject({ level: 'info', scope: 'dash', msg: 'built', durationMs: 5 })
    expect(entries[1]).toMatchObject({ level: 'warn', scope: 'dash', msg: 'pending' })
    expect(entries[2]).toMatchObject({ level: 'error', msg: 'query failed', err: { message: 'db down' } })
    expect(entries[2]).not.toHaveProperty('scope')
  })
})
