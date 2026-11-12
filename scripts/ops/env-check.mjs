// Checks one environment file of a deployment before the application starts. Plain Node, no dependencies, so it runs on a
// server that only has Node. It prints names of keys, line numbers and messages, and never a value.
//
//   node scripts/ops/env-check.mjs <file>                       the environment is read from APP_ENV in the file
//   node scripts/ops/env-check.mjs <file> --mode development    for env/development.env on a developer's computer
//
// Exit code: 0 the file is fine, 1 the file has problems (or cannot be read), 2 wrong use.
import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { isAppEnv } from '../lib/app-env.mjs'
import { checkEnvText } from '../lib/env-rules.mjs'

const USAGE = `Usage: node scripts/ops/env-check.mjs <file> [--mode development|staging|production]`

/** @param {string[]} argv @returns {number} the exit code */
function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { mode: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    })
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    return 2
  }
  if (parsed.values.help) {
    console.log(USAGE)
    return 0
  }
  const [file] = parsed.positionals
  if (!file || parsed.positionals.length > 1) {
    console.error(USAGE)
    return 2
  }
  const mode = parsed.values.mode
  if (mode !== undefined && !isAppEnv(mode)) {
    console.error(`--mode must be development, staging or production\n${USAGE}`)
    return 2
  }

  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'error'
    console.error(`env-check: cannot read ${file} (${code})`)
    return 1
  }

  // A deployment lives in a folder named oxy-<client>-<env>-finance-dashboard-<port>; the file must agree with it.
  const folderName = mode === 'development' ? undefined : basename(dirname(resolve(file)))
  const result = checkEnvText(text, { mode, folderName })
  for (const note of result.notes) console.log(`note: ${note}`)
  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(`ERROR ${problem}`)
    console.error(
      `env-check: ${result.problems.length} problem(s) in ${basename(file)}. The application was not started.`,
    )
    return 1
  }
  console.log(`env-check: OK (${result.mode}, ${result.keys.length} keys, ${basename(file)})`)
  return 0
}

process.exitCode = main(process.argv.slice(2))
