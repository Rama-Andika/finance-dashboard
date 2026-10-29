import { describe, expect, it } from 'vitest'
import { generateErpOid } from './oid'

describe('generateErpOid', () => {
  it('generates exact 19-digit ERP OID matching bitwise algorithm', () => {
    // 1700000000000n + 7n * 0x0100000000000000n = 5044048582654955520n
    // followed by randomDigit 3 -> '5044048582654955523'
    const oid = generateErpOid(7, 1700000000000, 3)
    expect(oid).toBe('5044048582654955523')
    expect(oid.length).toBe(19)
  })

  it('preserves full integer precision without scientific notation', () => {
    const oid = generateErpOid(1, 1000, 0)
    expect(typeof oid).toBe('string')
    expect(/^\d+$/.test(oid)).toBe(true)
  })
})
