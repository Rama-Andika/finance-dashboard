import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const HEALTH_CHECK = resolve(import.meta.dirname, 'health-check.mjs')

/** @type {import('node:http').Server[]} */
const servers = []

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  }
})

/** Starts a server on a free port; `answer(count)` gives [status, body] for the count-th request. */
async function startServer(answer) {
  let count = 0
  const server = createServer((_request, response) => {
    const [status, body] = answer(++count)
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  })
  servers.push(server)
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return server.address().port
}

function run(args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [HEALTH_CHECK, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (err += chunk))
    child.on('close', (status) => done({ status, out, err }))
  })
}

const FAST = ['--interval', '0.1', '--stable', '0', '--timeout', '3']

describe('health-check.mjs', { timeout: 30_000 }, () => {
  it('exits 0 when the right version answers', async () => {
    const port = await startServer(() => [200, { status: 'ok', version: 'v1.2.0', db: 'ok' }])
    const result = await run([
      '--url',
      `http://127.0.0.1:${port}/oxy-acme-finance-dashboard/health`,
      '--version',
      'v1.2.0',
      ...FAST,
    ])
    expect(result.status).toBe(0)
    expect(result.out).toContain('health-check: OK (1 attempt(s))')
  })

  it('keeps asking until the application is healthy', async () => {
    const port = await startServer((count) =>
      count < 3
        ? [503, { status: 'fail', version: 'v1', db: 'fail' }]
        : [200, { status: 'ok', version: 'v1', db: 'ok' }],
    )
    const result = await run(['--url', `http://127.0.0.1:${port}/health`, ...FAST])
    expect(result.status).toBe(0)
    expect(result.out).toContain('attempt 1: HTTP 503, database fail')
    expect(result.out).toContain('health-check: OK (3 attempt(s))')
  })

  it('exits 1 when another version keeps answering', async () => {
    const port = await startServer(() => [200, { status: 'ok', version: 'v1.1.0', db: 'ok' }])
    const result = await run([
      '--url',
      `http://127.0.0.1:${port}/health`,
      '--version',
      'v1.2.0',
      '--interval',
      '0.1',
      '--stable',
      '0',
      '--timeout',
      '0.5',
    ])
    expect(result.status).toBe(1)
    expect(result.err).toContain('another version answers (v1.1.0), expected v1.2.0')
  })

  it('exits 1 when nothing listens, and --once asks only one time', async () => {
    const port = await startServer(() => [200, {}])
    await new Promise((done) => servers.pop().close(done)) // the port is free again, nobody listens
    const result = await run(['--url', `http://127.0.0.1:${port}/health`, '--once'])
    expect(result.status).toBe(1)
    expect(result.err).toContain('cannot connect (ECONNREFUSED)')
    expect(result.err).toContain('after 1 attempt(s)')
  })

  it('refuses an address that is not on this computer, and wrong numbers', async () => {
    expect((await run(['--url', 'http://example.com/health'])).status).toBe(2)
    expect((await run(['--url', 'http://127.0.0.1:5205/a;b/health'])).status).toBe(2)
    expect((await run([])).status).toBe(2)
    expect((await run(['--url', 'http://127.0.0.1:5205/health', '--timeout', 'abc'])).status).toBe(2)
    expect((await run(['--url', 'http://127.0.0.1:5205/health', '--interval', '0'])).status).toBe(2)
  })
})
