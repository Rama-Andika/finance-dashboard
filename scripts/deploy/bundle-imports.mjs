import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, relative } from 'node:path'

/** The ways a built file names a package: import ... from "x", import "x", export ... from "x", import("x"), require("x"). */
const PATTERNS = [
  /\b(?:import|export)\s+(?:[^'"()]*?\sfrom\s*)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
]

/**
 * The package a module specifier belongs to ("drizzle-orm/mysql2" gives "drizzle-orm", "@tanstack/react-router/ssr"
 * gives "@tanstack/react-router"); null for relative paths, node: and other schemes, "#" imports, and Node's own modules.
 * @param {string} specifier
 * @returns {string | null}
 */
export function packageNameOf(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#') || specifier.includes(':'))
    return null
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : (specifier.split('/')[0] ?? '')
  return name === '' || builtinModules.includes(name) ? null : name
}

/**
 * The names of the packages a piece of built code imports.
 * @param {string} code
 * @returns {Set<string>}
 */
export function importedPackages(code) {
  /** @type {Set<string>} */
  const found = new Set()
  for (const pattern of PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const name = packageNameOf(match[1] ?? '')
      if (name !== null) found.add(name)
    }
  }
  return found
}

/**
 * The names of the packages that "npm ci --omit=dev" installs: every entry of package-lock.json that is not marked as a
 * development package (this includes the packages that production packages need themselves).
 * @param {string} lockText the text of package-lock.json (lockfileVersion 2 or 3)
 * @returns {Set<string>}
 */
export function productionPackages(lockText) {
  /** @type {{ packages?: Record<string, { dev?: boolean, devOptional?: boolean }> }} */
  const lock = JSON.parse(lockText)
  /** @type {Set<string>} */
  const names = new Set()
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === '' || entry.dev || entry.devOptional) continue
    const name = path.split('node_modules/').pop()
    if (name) names.add(name)
  }
  return names
}

/** Every .js and .mjs file under a folder. @param {string} dir @returns {string[]} */
function builtFiles(dir) {
  /** @type {string[]} */
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...builtFiles(path))
    else if (/\.m?js$/.test(entry.name)) files.push(path)
  }
  return files
}

/**
 * Checks the server side of a build: dist/server and dist/ops.
 * @param {string} distDir the dist folder
 * @param {string} lockText the text of package-lock.json
 * @returns {{ problems: string[], files: number }}
 */
export function scanBundle(distDir, lockText) {
  const production = productionPackages(lockText)
  /** @type {string[]} */
  const problems = []
  /** @type {Map<string, string>} */
  const firstFile = new Map()
  let files = 0
  for (const folder of ['server', 'ops']) {
    const dir = join(distDir, folder)
    if (!existsSync(dir)) {
      problems.push(`dist/${folder} is missing; build first`)
      continue
    }
    for (const file of builtFiles(dir)) {
      files++
      for (const name of importedPackages(readFileSync(file, 'utf8'))) {
        if (!production.has(name) && !firstFile.has(name))
          firstFile.set(name, relative(distDir, file).split('\\').join('/'))
      }
    }
  }
  for (const [name, file] of firstFile) {
    problems.push(
      `dist/${file} imports "${name}", which "npm ci --omit=dev" does not install (it is not a production package)`,
    )
  }
  return { problems, files }
}
