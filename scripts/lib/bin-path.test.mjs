import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveBinPath } from './bin-path.mjs'

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bin-path-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function installPackage(name, manifest) {
  const dir = join(root, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
}

describe('resolveBinPath', () => {
  it('reads a bin written as a string', () => {
    installPackage('tool-a', { bin: 'bin/run.js' })
    expect(resolveBinPath(root, 'tool-a')).toBe(join(root, 'node_modules', 'tool-a', 'bin/run.js'))
  })

  it('reads a bin written as an object', () => {
    installPackage('tool-b', { bin: { 'tool-b': './cli.mjs', other: './other.mjs' } })
    expect(resolveBinPath(root, 'tool-b')).toBe(join(root, 'node_modules', 'tool-b', './cli.mjs'))
  })

  it('says so when the tool is not installed', () => {
    expect(() => resolveBinPath(root, 'missing')).toThrow('not installed')
  })

  it('says so when the package has no command with its name', () => {
    installPackage('tool-c', { bin: { other: './other.mjs' } })
    expect(() => resolveBinPath(root, 'tool-c')).toThrow('has no command')
    installPackage('tool-d', {})
    expect(() => resolveBinPath(root, 'tool-d')).toThrow('has no command')
  })
})
