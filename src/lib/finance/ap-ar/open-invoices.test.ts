import { describe, expect, it } from 'vitest'
import { isZeroMoney, openBalance } from './open-invoices'

describe('isZeroMoney', () => {
  it('recognises zero in every spelling', () => {
    for (const z of ['0', '0.00', '-0.00', '000.0', ' 0.00 ']) expect(isZeroMoney(z)).toBe(true)
    for (const nz of ['0.01', '-0.01', '10', '100.00']) expect(isZeroMoney(nz)).toBe(false)
  })
})

describe('openBalance', () => {
  it('keeps the original amount as the balance when nothing was paid', () => {
    expect(openBalance('50.00', undefined)).toEqual({ original: '50.00', balance: '50.00' })
    expect(openBalance('-30.00', undefined)).toEqual({ original: '-30.00', balance: '-30.00' }) // credit note
  })

  it('returns null for an invoice that is zero or fully paid', () => {
    expect(openBalance('0.00', undefined)).toBeNull()
    expect(openBalance('100.00', '-100.00')).toBeNull()
  })

  it('subtracts the payments that were allocated to the invoice', () => {
    expect(openBalance('100.00', '-40.25')).toEqual({ original: '100.00', balance: '59.75' })
  })

  it('keeps an overpaid invoice open with a negative balance', () => {
    expect(openBalance('100.00', '-120.00')).toEqual({ original: '100.00', balance: '-20.00' })
  })

  it('does not lose cents to floating point', () => {
    expect(openBalance('0.30', '-0.10')?.balance).toBe('0.20')
  })
})
