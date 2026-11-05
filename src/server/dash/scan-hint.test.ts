import { describe, expect, it } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { sql } from 'drizzle-orm'
import { FULL_SCAN_HINT, fullScanHint } from './scan-hint'

const text = (fragment: ReturnType<typeof fullScanHint>) => new MySqlDialect().sqlToQuery(sql`x ${fragment} y`).sql

describe('fullScanHint', () => {
  it("forces the primary key only for a whole-side read of today's snapshot", () => {
    expect(text(fullScanHint(null, false))).toContain('FORCE INDEX (PRIMARY)')
    expect(text(fullScanHint(null, true))).not.toContain('INDEX')
    expect(text(fullScanHint('2026-05-31', false))).not.toContain('INDEX')
  })

  it('is the one hint the whole-side reader of the invoice list uses', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('./snapshot.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    const start = source.indexOf('async function readOpenInvoices')
    const end = source.indexOf('async function readUnallocated')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(source.slice(start, end)).toContain('${FULL_SCAN_HINT}')
    expect(FULL_SCAN_HINT).toBeDefined()
  })
})
