// Starts a tool of this project on a developer's computer, with the settings of env/development.env.
//
//   node scripts/local.mjs <tool> [arguments...]          a tool installed in node_modules: vite, vitest, tsx, drizzle-kit
//   node scripts/local.mjs node <script> [arguments...]   a plain Node script
//
// This is the only place that reads env/development.env: the application itself never opens an env file
// (src/server/env.ts only reads process.env). It also sets APP_ENV=development. The npm scripts that need a database
// or the application (dev, test:db, db:pull, db:dash:migrate, db:dash:status, dash:refresh*, logs:find, seed, start:local)
// all go through it. "npm start" does not: that is the command of a server, whose settings come from systemd.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveBinPath } from './lib/bin-path.mjs'
import { parseEnvFile } from './lib/env-file.mjs'
import { checkEnvText } from './lib/env-rules.mjs'

const root = resolve(import.meta.dirname, '..')
const envFile = join(root, 'env', 'development.env')
const [tool, ...toolArgs] = process.argv.slice(2)

if (!tool) {
  console.error('Usage: node scripts/local.mjs <tool> [arguments...]   (for example: node scripts/local.mjs vite dev)')
  process.exit(2)
}

if (!existsSync(envFile)) {
  console.error('The file env/development.env does not exist.')
  console.error('Create it: make the folder env/, copy .env.example to env/development.env and fill in the values.')
  console.error('The folder env/ is ignored by git, so the file never ends up in a commit.')
  process.exit(1)
}

const text = readFileSync(envFile, 'utf8')
const { problems } = checkEnvText(text, { mode: 'development' })
if (problems.length > 0) {
  console.error('env/development.env has problems (names and line numbers only, never values):')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('Fix the file and run the command again.')
  process.exit(1)
}

if (process.env.APP_ENV && process.env.APP_ENV !== 'development') {
  console.error(`APP_ENV is "${process.env.APP_ENV}" in this shell, but scripts/local.mjs only runs development.`)
  console.error('Remove APP_ENV from the shell and run the command again.')
  process.exit(1)
}

// A variable that is already set in the shell wins over the file (the same rule as systemd uses).
for (const { key, value } of parseEnvFile(text).entries) {
  if (process.env[key] === undefined) process.env[key] = value
}
process.env.APP_ENV = 'development'

let command
try {
  command = tool === 'node' ? toolArgs : [resolveBinPath(root, tool), ...toolArgs]
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const child = spawn(process.execPath, command, { stdio: 'inherit', env: process.env })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', (error) => {
  console.error(`Could not start "${tool}": ${error.message}`)
  process.exitCode = 1
})
// Wait for the tool to end and pass its exit code on (on Windows, ending Node while a child still closes crashes it).
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
