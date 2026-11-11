import { describe, expect, it, vi } from 'vitest'
import { createClientErrorReporter, type SendReport } from './client-error-reporter'
import { CLIENT_ERROR_LIMITS } from './report-schema'

const context = { origin: 'render', route: '/summary' } as const

function sender(reference: string | null = 'ref-1') {
  return vi.fn<SendReport>(async () => ({ reference }))
}

describe('createClientErrorReporter', () => {
  it('sends a report and answers the reference code from the server', async () => {
    const send = sender('20261110-145012-b6n5k')
    const reporter = createClientErrorReporter(send)
    const reference = await reporter.report(new TypeError('x is undefined'), {
      ...context,
      componentStack: '\n    at BillsTable',
      userAgent: 'Chrome/131',
    })
    expect(reference).toBe('20261110-145012-b6n5k')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      origin: 'render',
      name: 'TypeError',
      message: 'x is undefined',
      route: '/summary',
      componentStack: '\n    at BillsTable',
      userAgent: 'Chrome/131',
    })
  })

  it('does not send an error that already carries a request id, and answers that id', async () => {
    const send = sender()
    const reporter = createClientErrorReporter(send)
    const error = new Error('INTERNAL_ERROR#20261110-143551-k7q2m')
    expect(await reporter.report(error, context)).toBe('20261110-143551-k7q2m')
    expect(send).not.toHaveBeenCalled()
  })

  it('does not report a public error code that has no id', async () => {
    const send = sender()
    const reporter = createClientErrorReporter(send)
    expect(await reporter.report(new Error('INTERNAL_ERROR'), context)).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it('reports the same error once, even when it is asked for twice (React runs effects twice in development)', async () => {
    const send = sender()
    const reporter = createClientErrorReporter(send)
    const error = new Error('same')
    const [a, b] = await Promise.all([reporter.report(error, context), reporter.report(error, context)])
    expect(a).toBe('ref-1')
    expect(b).toBe('ref-1')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('reports an error with another message, and the same message on another route', async () => {
    const send = sender()
    const reporter = createClientErrorReporter(send)
    await reporter.report(new Error('one'), context)
    await reporter.report(new Error('two'), context)
    await reporter.report(new Error('one'), { ...context, route: '/payables' })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('stops sending after the limit and answers null', async () => {
    const send = sender()
    const reporter = createClientErrorReporter(send, 2)
    await reporter.report(new Error('1'), context)
    await reporter.report(new Error('2'), context)
    expect(await reporter.report(new Error('3'), context)).toBeNull()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('answers null when sending fails, and never throws', async () => {
    const send = vi.fn<SendReport>(async () => {
      throw new Error('network down')
    })
    const reporter = createClientErrorReporter(send)
    expect(await reporter.report(new Error('x'), context)).toBeNull()
    const throwsAtOnce = vi.fn<SendReport>(() => {
      throw new Error('sync failure')
    })
    expect(await createClientErrorReporter(throwsAtOnce).report(new Error('y'), context)).toBeNull()
  })

  it('describes a value that is not an Error, and cuts every text to its limit', async () => {
    const send = sender()
    const reporter = createClientErrorReporter(send)
    await reporter.report('plain text', context)
    expect(send.mock.calls[0]?.[0]).toMatchObject({ name: 'NonError', message: 'plain text' })

    const long = Object.assign(new Error('m'.repeat(5000)), { name: 'N'.repeat(500) })
    long.stack = 's'.repeat(20_000)
    await reporter.report(long, {
      ...context,
      route: 'r'.repeat(900),
      componentStack: 'c'.repeat(9000),
      userAgent: 'u'.repeat(900),
    })
    const sentReport = send.mock.calls[1]?.[0]
    expect(sentReport?.name.length).toBe(CLIENT_ERROR_LIMITS.name)
    expect(sentReport?.message.length).toBe(CLIENT_ERROR_LIMITS.message)
    expect(sentReport?.stack?.length).toBe(CLIENT_ERROR_LIMITS.stack)
    expect(sentReport?.route.length).toBe(CLIENT_ERROR_LIMITS.route)
    expect(sentReport?.componentStack?.length).toBe(CLIENT_ERROR_LIMITS.componentStack)
    expect(sentReport?.userAgent?.length).toBe(CLIENT_ERROR_LIMITS.userAgent)
  })
})
