// Waits until a deployment answers its health check well, and keeps answering well for a few seconds. Plain Node, no
// dependencies, so it runs on a server that only has Node. It only asks addresses on the same computer.
//
//   node scripts/ops/health-check.mjs --url <address> [--version <version>] [--timeout <s>] [--interval <s>] [--stable <s>] [--once]
//
// Exit code: 0 healthy, 1 not healthy before the time ran out, 2 wrong use.
import { parseArgs } from 'node:util'
import { waitForHealth } from '../lib/health-wait.mjs'

const USAGE = `Usage: node scripts/ops/health-check.mjs --url <http://127.0.0.1:PORT/.../health> [--version <version>] [--timeout <seconds>] [--interval <seconds>] [--stable <seconds>] [--once]`

/** Only this computer, and only a path made of safe characters that ends in /health. */
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}(\/[A-Za-z0-9._-]+)*\/health$/

/** A number of seconds, at least `min`, as milliseconds; null when it is not one. @param {string | undefined} text @param {number} fallback @param {number} min */
function toMilliseconds(text, fallback, min) {
  if (text === undefined) return fallback * 1000
  const seconds = Number(text)
  return Number.isFinite(seconds) && seconds >= min ? Math.round(seconds * 1000) : null
}

/** @param {string[]} argv @returns {Promise<number>} the exit code */
async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        url: { type: 'string' },
        version: { type: 'string' },
        timeout: { type: 'string' },
        interval: { type: 'string' },
        stable: { type: 'string' },
        once: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    return 2
  }
  const { values } = parsed
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  if (!values.url || !LOCAL_URL.test(values.url)) {
    console.error(
      `--url must be an http address on this computer (127.0.0.1 or localhost) that ends in /health\n${USAGE}`,
    )
    return 2
  }
  const once = values.once === true
  const timeoutMs = once ? 0 : toMilliseconds(values.timeout, 120, 0)
  const intervalMs = toMilliseconds(values.interval, 2, 0.1)
  const stableMs = once ? 0 : toMilliseconds(values.stable, 10, 0)
  if (timeoutMs === null || intervalMs === null || stableMs === null) {
    console.error(`--timeout and --stable must be numbers of seconds (0 or more), --interval at least 0.1\n${USAGE}`)
    return 2
  }

  // A line is printed when it says something new (or every 10th attempt), so that 60 failed attempts do not fill the screen.
  let lastMessage = ''
  const result = await waitForHealth({
    url: values.url,
    expectVersion: values.version,
    timeoutMs,
    intervalMs,
    stableMs,
    log: (line) => {
      const message = line.replace(/^attempt \d+: /, '')
      const attempt = Number(/^attempt (\d+):/.exec(line)?.[1])
      if (message === lastMessage && attempt % 10 !== 0) return
      lastMessage = message
      console.log(line)
    },
  })
  if (result.ok) {
    console.log(`health-check: OK (${result.attempts} attempt(s))`)
    return 0
  }
  console.error(`health-check: FAILED after ${result.attempts} attempt(s): ${result.reason}`)
  return 1
}

process.exitCode = await main(process.argv.slice(2))
