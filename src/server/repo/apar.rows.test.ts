import { describe, expect, it } from 'vitest'
import { toAgingInvoice, toAgingUnallocated } from './apar.rows'

describe('toAgingInvoice', () => {
  const row = {
    invoiceId: '9007199254740993',
    invoiceNumber: 'INV-1',
    partyId: '77',
    locationId: '5',
    coaId: '300',
    txDate: '2026-03-01T00:00:00.000Z',
    dueDate: '2026-03-31',
    itemType: '1',
    originalAmount: '100.50',
    balance: 40.5,
  }

  it('maps a row and puts the party id under the name of the side', () => {
    expect(toAgingInvoice(row, 'vendorId')).toEqual({
      invoiceId: '9007199254740993',
      invoiceNumber: 'INV-1',
      vendorId: '77',
      locationId: '5',
      coaId: '300',
      txDate: '2026-03-01',
      dueDate: '2026-03-31',
      itemType: 1,
      originalAmount: '100.50',
      balance: '40.50',
    })
    expect(toAgingInvoice(row, 'customerId')).toHaveProperty('customerId', '77')
  })

  it('fills the gaps of an incomplete row', () => {
    const mapped = toAgingInvoice(
      { ...row, invoiceNumber: null, partyId: null, locationId: null, coaId: null, dueDate: null, balance: '' },
      'vendorId',
    )
    expect(mapped).toMatchObject({
      invoiceNumber: '',
      vendorId: '',
      locationId: '',
      coaId: '',
      dueDate: null,
      balance: '0.00',
    })
  })

  it('fails on an item type that is not a whole number instead of using 0', () => {
    expect(() => toAgingInvoice({ ...row, itemType: 'x' }, 'vendorId')).toThrow('not a whole number')
  })
})

describe('toAgingUnallocated', () => {
  it('maps a row and rounds an amount that is not a 2-decimal string', () => {
    expect(
      toAgingUnallocated(
        { cardId: '12', partyId: '3', locationId: null, coaId: '4', txDate: '2026-04-02', balance: -12.345 },
        'customerId',
      ),
    ).toEqual({ cardId: '12', customerId: '3', locationId: '', coaId: '4', txDate: '2026-04-02', balance: '-12.35' })
  })
})
