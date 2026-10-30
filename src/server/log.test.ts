import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger, errorText } from './log'

afterEach(() => vi.restoreAllMocks())

describe('errorText', () => {
  it('uses the message of an Error and the text of anything else', () => {
    expect(errorText(new Error('boom'))).toBe('boom')
    expect(errorText('plain')).toBe('plain')
    expect(errorText(42)).toBe('42')
    expect(errorText(undefined)).toBe('undefined')
  })
})

describe('createLogger', () => {
  it('prefixes every line with the scope', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createLogger('dash')
    logger.info('built')
    logger.warn('pending')
    logger.error('failed')
    expect(log).toHaveBeenCalledWith('dash: built')
    expect(warn).toHaveBeenCalledWith('dash: pending')
    expect(error).toHaveBeenCalledWith('dash: failed')
  })

  it('has no prefix without a scope and passes the cause on untouched', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('db down')
    createLogger().error('query failed:', cause)
    expect(error).toHaveBeenCalledWith('query failed:', cause)
  })
})
