import { describe, expect, it } from 'vitest'
import { D } from '../../core/money'
import { createSettlementSums } from './settlement-sums'

describe('createSettlementSums', () => {
  it('groups amounts by invoice id and preserves single-row amounts as exact text', () => {
    const sums = createSettlementSums(new Set(['c1', 'c2']))
    sums.add('i1', 'c1', '10.00')
    sums.add('i1', 'c2', '-4.50')
    sums.add('i2', 'c1', '7.25')

    const result = sums.result()
    expect(result.size).toBe(2)
    expect(D(result.get('i1')!).eq(D('5.5'))).toBe(true)
    expect(result.get('i2')).toBe('7.25')
  })

  it('ignores details of cards that are not settlement cards', () => {
    const sums = createSettlementSums(new Set(['c1']))
    sums.add('i1', 'c9', '10.00')

    const result = sums.result()
    expect(result.size).toBe(0)
  })

  it('ignores null or undefined invoiceId and amount', () => {
    const sums = createSettlementSums(new Set(['c1']))
    sums.add(null, 'c1', '10.00')
    sums.add(undefined, 'c1', '10.00')
    sums.add('i1', 'c1', null)
    sums.add('i2', 'c1', undefined)

    const result = sums.result()
    expect(result.size).toBe(0)
    expect(result.has('i1')).toBe(false)
    expect(result.has('i2')).toBe(false)
  })

  it('preserves exact cents without binary floating point inaccuracy', () => {
    const sums = createSettlementSums(new Set(['c1']))
    sums.add('i1', 'c1', '0.10')
    sums.add('i1', 'c1', '0.20')

    const result = sums.result()
    expect(D(result.get('i1')!).eq(D('0.3'))).toBe(true)
  })

  it('treats numeric IDs from driver as strings', () => {
    const sums = createSettlementSums(new Set(['7']))
    sums.add(5, 7, '1.00')

    const result = sums.result()
    expect(result.get('5')).toBe('1.00')
  })

  it('keeps large numbers exact', () => {
    const sums = createSettlementSums(new Set(['c1']))
    sums.add('i1', 'c1', '9999999999999999999999.99')
    sums.add('i1', 'c1', '0.01')

    const result = sums.result()
    expect(result.get('i1')).toBe('10000000000000000000000')
  })
})
