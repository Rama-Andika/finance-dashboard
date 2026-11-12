import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The JavaScript file that starts a tool installed in node_modules (for example "vite" or "tsx"), found through the "bin"
 * field of the package. Running that file with Node avoids shells and behaves the same on Windows and Linux.
 * @param {string} root the folder that holds node_modules
 * @param {string} tool the package name, which must also be the name of its command
 */
export function resolveBinPath(root, tool) {
  const packageDir = join(root, 'node_modules', tool)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  } catch {
    throw new Error(`The tool "${tool}" is not installed in node_modules (run npm ci).`)
  }
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[tool]
  if (!bin) throw new Error(`The package "${tool}" has no command called "${tool}".`)
  return join(packageDir, bin)
}
