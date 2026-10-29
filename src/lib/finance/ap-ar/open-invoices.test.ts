import { describe, expect, it } from 'vitest'
import { isZeroMoney, openInvoices } from './open-invoices'

describe('isZeroMoney', () => {
  it('recognises zero in every spelling', () => {
    for (const z of ['0', '0.00', '-0.00', '000.0', ' 0.00 ']) expect(isZeroMoney(z)).toBe(true)
    for (const nz of ['0.01', '-0.01', '10', '100.00']) expect(isZeroMoney(nz)).toBe(false)
  })
})

describe('openInvoices', () => {
  it('keeps invoices with a remaining balance and drops the fully paid ones', () => {
    const payments = new Map([
      ['paid', '-100.00'], // fully paid
      ['partial', '-40.25'],
      ['overpaid', '-120.00'],
    ])
    const result = openInvoices(
      [
        { id: 'unpaid', original: '50.00' },
        { id: 'paid', original: '100.00' },
        { id: 'partial', original: '100.00' },
        { id: 'overpaid', original: '100.00' },
        { id: 'credit-note', original: '-30.00' },
        { id: 'zero', original: '0.00' },
      ],
      payments,
    )
    expect(result).toEqual([
      { id: 'unpaid', original: '50.00', balance: '50.00' },
      { id: 'partial', original: '100.00', balance: '59.75' },
      { id: 'overpaid', original: '100.00', balance: '-20.00' },
      { id: 'credit-note', original: '-30.00', balance: '-30.00' },
    ])
  })

  it('does not lose cents to floating point', () => {
    const result = openInvoices([{ id: 'a', original: '0.30' }], new Map([['a', '-0.10']]))
    expect(result[0]!.balance).toBe('0.20')
  })
})
