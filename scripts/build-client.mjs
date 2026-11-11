// Builds the app for one client: npm run build:client -- <client-id>
// The client id fixes the URL prefix /oxy-<client-id>-finance-dashboard/ inside the build (see vite.config.ts).
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const clientId = process.argv[2]
if (!clientId || clientId.startsWith('-')) {
  console.error('Usage: npm run build:client -- <client-id>   (lowercase letters, digits and dashes, e.g. client-a)')
  process.exit(1)
}

const root = resolve(import.meta.dirname, '..')
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const result = spawnSync(process.execPath, [viteBin, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CLIENT_ID: clientId },
})
if (result.status !== 0) process.exit(result.status ?? 1)

const { base } = JSON.parse(readFileSync(join(root, 'dist', 'base-path.json'), 'utf8'))
console.log(`\nBuilt for ${base} (CLIENT_ID=${clientId}). Run the server with the same CLIENT_ID.`)
