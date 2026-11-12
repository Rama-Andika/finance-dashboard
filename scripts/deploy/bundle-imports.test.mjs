import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importedPackages, packageNameOf, productionPackages, scanBundle } from './bundle-imports.mjs'

describe('packageNameOf', () => {
  it('gives the package of a specifier', () => {
    expect(packageNameOf('react')).toBe('react')
    expect(packageNameOf('drizzle-orm/mysql2/migrator')).toBe('drizzle-orm')
    expect(packageNameOf('@tanstack/react-router/ssr/server')).toBe('@tanstack/react-router')
  })

  it('gives null for what is not a package', () => {
    for (const specifier of [
      './chunk.js',
      '../x.js',
      '/abs/x.js',
      'node:fs',
      'fs',
      'fs/promises',
      'path',
      '#internal',
      'data:text/javascript,1',
    ]) {
      expect(packageNameOf(specifier)).toBeNull()
    }
  })
})

describe('importedPackages', () => {
  it('finds every way of naming a package', () => {
    const code = `
      import React from "react";
      import { a, b } from 'zod';
      import * as dec from "decimal.js";
      import "side-effect-only";
      export * from "reexported";
      export { x } from "reexported-named";
      const lazy = await import("lazy-package");
      const old = require("old-package");
      import fs from "node:fs";
      import local from "./local.js";
      import { sql } from "drizzle-orm/sql";
    `
    expect([...importedPackages(code)].sort()).toEqual(
      [
        'decimal.js',
        'drizzle-orm',
        'lazy-package',
        'old-package',
        'react',
        'reexported',
        'reexported-named',
        'side-effect-only',
        'zod',
      ].sort(),
    )
  })

  it('finds nothing in code without imports', () => {
    expect(importedPackages('const a = 1; console.log("hello from the server")').size).toBe(0)
  })
})

describe('productionPackages', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'app' },
      'node_modules/react': { version: '1' },
      'node_modules/cookie-es': { version: '1' },
      'node_modules/@tanstack/history': { version: '1' },
      'node_modules/vite': { version: '1', devOptional: true },
      'node_modules/tsx': { version: '1', dev: true },
      'node_modules/a/node_modules/nested': { version: '1' },
    },
  })

  it('keeps what npm ci --omit=dev installs, including the packages that production packages need', () => {
    expect([...productionPackages(lock)].sort()).toEqual(['@tanstack/history', 'cookie-es', 'nested', 'react'])
  })
})

describe('scanBundle', () => {
  let work = ''
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: { '': {}, 'node_modules/react': {}, 'node_modules/tsx': { dev: true } },
  })

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'bundle-imports-'))
    mkdirSync(join(work, 'server', 'assets'), { recursive: true })
    mkdirSync(join(work, 'ops'), { recursive: true })
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('accepts a build that only imports production packages', () => {
    writeFileSync(join(work, 'server', 'server-entry.js'), 'import React from "react"; import fs from "node:fs";')
    writeFileSync(join(work, 'ops', 'dash-migrate.mjs'), 'import { x } from "react";')
    expect(scanBundle(work, lock)).toEqual({ problems: [], files: 2 })
  })

  it('reports a development package once, with the first file that imports it', () => {
    writeFileSync(join(work, 'server', 'assets', 'a.js'), 'import "tsx";')
    writeFileSync(join(work, 'ops', 'x.mjs'), 'import "tsx"; import "unknown-package";')
    const { problems } = scanBundle(work, lock)
    expect(problems).toEqual([
      'dist/server/assets/a.js imports "tsx", which "npm ci --omit=dev" does not install (it is not a production package)',
      'dist/ops/x.mjs imports "unknown-package", which "npm ci --omit=dev" does not install (it is not a production package)',
    ])
  })

  it('reports a missing folder', () => {
    rmSync(join(work, 'ops'), { recursive: true })
    expect(scanBundle(work, lock).problems).toEqual(['dist/ops is missing; build first'])
  })
})
