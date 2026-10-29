import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { dashTable, ints } from './tables'

/**
 * The dashboard may write only to its own `dash_*` tables; the ERP tables are read only.
 * This test reads the migration files and the dash code and fails when a write statement targets anything else.
 */

const ROOT = path.resolve(__dirname, '../../..')

// A write statement and the table it targets (first identifier after the keywords).
const WRITE_RE =
  /\b(?:INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|(?<!DUPLICATE\s+KEY\s+)UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|ALTER\s+TABLE|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|RENAME\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX\s+`?\w+`?\s+ON)\s+(`?[A-Za-z_?][\w?]*`?)/gi

function targets(source: string): string[] {
  return Array.from(source.matchAll(WRITE_RE), (m) => m[1]!.replace(/`/g, ''))
}

function filesIn(dir: string, ext: RegExp, skip: RegExp[] = []): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => ext.test(f) && !skip.some((s) => s.test(f)))
    .map((f) => path.join(dir, f))
}

describe('dash tables only', () => {
  it('every migration statement touches a dash_ table', () => {
    const files = filesIn(path.join(ROOT, 'drizzle-dash'), /\.sql$/)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const bad = targets(fs.readFileSync(file, 'utf8')).filter((t) => !t.startsWith('dash_'))
      expect({ file: path.basename(file), bad }).toEqual({ file: path.basename(file), bad: [] })
    }
  })

  it('code in src/server/dash and the dash scripts writes only to dash_ tables (or through dashTable())', () => {
    const files = [
      ...filesIn(path.join(ROOT, 'src/server/dash'), /\.ts$/, [/\.test\.ts$/]),
      ...filesIn(path.join(ROOT, 'scripts'), /^dash-.*\.ts$/),
    ]
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      const found = targets(source)
      const bad = found.filter((t) => !t.startsWith('dash_') && !t.startsWith('?'))
      expect({ file: path.basename(file), bad }).toEqual({ file: path.basename(file), bad: [] })
      // a `??` placeholder is only allowed when the name went through dashTable()
      if (found.some((t) => t.startsWith('?'))) expect(source).toContain('dashTable(')
    }
  })

  it('no code outside the dash folder writes to dash tables by hand', () => {
    const files = filesIn(path.join(ROOT, 'src/server/repo'), /\.ts$/, [/\.test\.ts$/])
    for (const file of files) {
      expect(targets(fs.readFileSync(file, 'utf8')).filter((t) => t.startsWith('dash_'))).toEqual([])
    }
  })
})

describe('dashTable / ints', () => {
  it('accepts dash_ names only', () => {
    expect(dashTable('dash_snap_meta')).toBe('dash_snap_meta')
    expect(() => dashTable('ap_ar_card')).toThrow('non-dash')
    expect(() => dashTable('dash_x; DROP TABLE gl')).toThrow()
    expect(() => dashTable('DASH_UPPER')).toThrow()
  })

  it('inlines integers only', () => {
    expect(ints([1, 2, 3])).toBe('1, 2, 3')
    expect(() => ints([])).toThrow()
    expect(() => ints([1.5])).toThrow()
    expect(() => ints(['1) OR (1=1' as unknown as number])).toThrow()
  })
})
