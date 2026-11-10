import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { captureLogs, resetLoggerForTests } from './logger-core'
import { installProcessHandlers } from './process-handlers'

function setup(exitOnFatal: boolean) {
  const target = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'on'>
  const flush = vi.fn()
  const exit = vi.fn()
  installProcessHandlers({ flush, exitOnFatal, exit, target })
  return { target, flush, exit }
}

describe('installProcessHandlers', () => {
  it('logs an uncaught exception as fatal, flushes, and exits in production', () => {
    resetLoggerForTests()
    const capture = captureLogs()
    const { target, flush, exit } = setup(true)
    target.emit('uncaughtException', new Error('boom'))
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({
      level: 'fatal',
      scope: 'process',
      reason: 'uncaughtException',
      err: { message: 'boom' },
    })
    expect(flush).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('logs an unhandled rejection of a plain value', () => {
    resetLoggerForTests()
    const capture = captureLogs()
    const { target, exit } = setup(true)
    target.emit('unhandledRejection', 'nope')
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({
      level: 'fatal',
      reason: 'unhandledRejection',
      err: { type: 'NonError', message: 'nope' },
    })
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('only logs and flushes outside production', () => {
    resetLoggerForTests()
    const capture = captureLogs()
    const { target, flush, exit } = setup(false)
    target.emit('uncaughtException', new Error('boom'))
    capture.stop()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
  })
})
