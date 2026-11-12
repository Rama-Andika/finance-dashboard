// Creates or updates the environment file of one deployment. Plain Node, no dependencies. It never prints a secret.
//
//   node scripts/ops/init-env.mjs create --client <name> --env <staging|production> --port <number> --file <path> [--timezone <zone>]
//   node scripts/ops/init-env.mjs rotate-secret --file <path>
//
// create makes a new file (it refuses to overwrite one) with a random SESSION_SECRET and mode 600, and leaves
// DATABASE_URL empty for the owner to fill in. rotate-secret replaces SESSION_SECRET: every user of that client is
// signed out when the service restarts. Exit code: 0 done, 1 could not do it, 2 wrong use.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { buildEnvFileText, newSessionSecret, replaceSessionSecret } from '../lib/env-template.mjs'

const USAGE = `Usage:
  node scripts/ops/init-env.mjs create --client <name> --env <staging|production> --port <number> --file <path> [--timezone <zone>]
  node scripts/ops/init-env.mjs rotate-secret --file <path>`

/** @param {unknown} error */
function codeOf(error) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : 'error'
}

/** @param {string[]} argv @returns {number} the exit code */
function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        client: { type: 'string' },
        env: { type: 'string' },
        port: { type: 'string' },
        file: { type: 'string' },
        timezone: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    return 2
  }
  const { values, positionals } = parsed
  const [command] = positionals
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  if (positionals.length !== 1 || (command !== 'create' && command !== 'rotate-secret') || !values.file) {
    console.error(USAGE)
    return 2
  }
  const file = values.file

  if (command === 'create') {
    if (!values.client || !values.env || !values.port) {
      console.error(USAGE)
      return 2
    }
    let text
    try {
      text = buildEnvFileText({
        client: values.client,
        env: values.env,
        port: Number(values.port),
        secret: newSessionSecret(),
        timezone: values.timezone,
      })
    } catch (error) {
      console.error(`init-env: ${error instanceof Error ? error.message : String(error)}`)
      return 2
    }
    try {
      // The flag "wx" fails when the file already exists, so a file in use is never overwritten.
      writeFileSync(file, text, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      console.error(
        codeOf(error) === 'EEXIST'
          ? `init-env: ${file} already exists; it was not changed`
          : `init-env: cannot write ${file} (${codeOf(error)})`,
      )
      return 1
    }
    console.log(`init-env: created ${file} (mode 600).`)
    console.log('Next: fill in DATABASE_URL, then run: node scripts/ops/env-check.mjs ' + file)
    return 0
  }

  try {
    const next = replaceSessionSecret(readFileSync(file, 'utf8'), newSessionSecret())
    writeFileSync(file, next)
    chmodSync(file, 0o600)
  } catch (error) {
    console.error(
      `init-env: cannot replace the secret in ${file} (${error instanceof Error ? error.message : codeOf(error)})`,
    )
    return 1
  }
  console.log(
    `init-env: replaced SESSION_SECRET in ${file}. Restart the service: every user of this client is signed out.`,
  )
  return 0
}

process.exitCode = main(process.argv.slice(2))
