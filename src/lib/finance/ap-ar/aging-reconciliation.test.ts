import { describe, expect, it } from 'vitest'
import { reconcileAging } from './aging-reconciliation'

describe('reconcileAging', () => {
  it('is in sync when GL and sub-ledger are equal', () => {
    expect(reconcileAging('1000.00', '1000.00')).toEqual({ gl: '1000.00', subledger: '1000.00', diff: '0.00', inSync: true })
  })

  it('treats a difference below one rupiah as rounding', () => {
    expect(reconcileAging('1000.40', '1000.00').inSync).toBe(true)
  })

  it('reports the signed difference (GL minus sub-ledger) when they differ', () => {
    const r = reconcileAging('900.00', '1000.00')
    expect(r.diff).toBe('-100.00')
    expect(r.inSync).toBe(false)
  })
})
