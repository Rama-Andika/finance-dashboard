import { afterEach, describe, expect, it } from 'vitest'
import type { ClientErrorReport } from '~/lib/client-errors/report-schema'
import { runWithLogContext } from '~/server/logging/log-context'
import { captureLogs, resetLoggerForTests } from '~/server/logging/logger-core'
import { recordClientError } from './client-error.service'

afterEach(() => resetLoggerForTests())

const report: ClientErrorReport = {
  origin: 'render',
  name: 'TypeError',
  message: 'x is undefined',
  stack: 'TypeError: x is undefined\n    at BillsTable',
  componentStack: '\n    at BillsTable',
  route: '/summary',
  userAgent: 'Chrome/131',
}

describe('recordClientError', () => {
  it('logs the report as an error line and answers the request id', () => {
    const capture = captureLogs()
    const result = runWithLogContext({ reqId: '20261110-145012-b6n5k', userId: 'u-log-1' }, () =>
      recordClientError('u-log-1', report),
    )
    const [entry] = capture.entries()
    capture.stop()
    expect(result).toEqual({ reference: '20261110-145012-b6n5k' })
    expect(entry).toMatchObject({
      level: 'error',
      scope: 'client',
      msg: 'client error',
      reqId: '20261110-145012-b6n5k',
      origin: 'render',
      route: '/summary',
      userAgent: 'Chrome/131',
      clientError: { name: 'TypeError', message: 'x is undefined' },
    })
  })

  it('answers null outside a request', () => {
    const capture = captureLogs()
    expect(recordClientError('u-log-2', report)).toEqual({ reference: null })
    capture.stop()
  })

  it('drops the reports of one user after twenty in ten minutes, and leaves other users alone', () => {
    const capture = captureLogs()
    for (let i = 0; i < 20; i++) recordClientError('u-log-flood', report)
    expect(capture.entries()).toHaveLength(20)
    const dropped = runWithLogContext({ reqId: 'r' }, () => recordClientError('u-log-flood', report))
    expect(dropped).toEqual({ reference: null })
    expect(capture.entries()).toHaveLength(20)
    const other = runWithLogContext({ reqId: 'r2' }, () => recordClientError('u-log-other', report))
    expect(other).toEqual({ reference: 'r2' })
    capture.stop()
  })
})
