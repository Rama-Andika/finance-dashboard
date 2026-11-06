import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./refresh-ap-ar.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const between = (from: string, to: string): string => {
  const a = source.indexOf(from)
  const b = source.indexOf(to, a)
  expect(a).toBeGreaterThan(-1)
  expect(b).toBeGreaterThan(a)
  return source.slice(a, b)
}

describe('SQL of the AP/AR rebuild scans', () => {
  const settlements = between('export async function loadSettlementSums', 'export async function loadOpenInvoices')
  const invoices = between('export async function loadOpenInvoices', 'export async function loadUnallocated')

  it('scans the cards in primary-key order, for the settlement cards and for the invoices', () => {
    expect(settlements).toContain('FROM ap_ar_card p ${FULL_SCAN_HINT_TEXT}')
    expect(invoices).toContain('FROM ap_ar_card i ${FULL_SCAN_HINT_TEXT}')
  })

  it('reads the settlement details with no join, no grouping and no index hint (the covering index may not exist)', () => {
    expect(settlements).toContain('FROM ap_ar_card_detail d')
    expect(settlements).not.toMatch(/JOIN|GROUP BY|SUM\(/)
    expect(settlements).not.toMatch(/FORCE INDEX \(idx_|USE INDEX|IGNORE INDEX/)
  })

  it('no longer runs the join with grouping inside loadOpenInvoices', () => {
    expect(invoices).not.toMatch(/GROUP BY|SUM\(d\.amount\)/)
    expect(invoices).not.toContain('loadSettlementSums(')
  })

  it('reads the settlement sums once per side and shares them', () => {
    const sideRows = between('export async function loadSideRows', 'export async function erpFingerprint')
    expect(sideRows.match(/loadSettlementSums\(/g)).toHaveLength(1)
    expect(sideRows).toContain('loadOpenInvoices(conn, side, asOfPlusOne, allocated, timer)')
    expect(sideRows).toContain('loadUnallocated(conn, side, asOfPlusOne, allocated, timer)')
  })

  it('loads the unallocated cards with the same NOT EXISTS scan and reduces AR direct returns by their allocations', () => {
    const unallocated = between('export async function loadUnallocated', 'export async function loadSideRows')
    expect(unallocated).toContain(
      'NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)',
    )
    expect(unallocated).toContain('unallocatedAllocatedLater')
    expect(unallocated).toContain('openBalance(')
  })
})
