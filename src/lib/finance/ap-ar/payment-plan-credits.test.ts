import { describe, expect, it } from 'vitest'
import {
  applyCredits,
  creditPoolsFromItems,
  subtractReductions,
  type CreditableBill,
  type CreditPool,
  type DueTotals,
} from './payment-plan-credits'

describe('payment-plan-credits', () => {
  describe('applyCredits', () => {
    it('reduces bills by return credits (case 1)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-16', balance: '22200.00' },
      ]
      const pools: CreditPool[] = [{ partyId: 'v1', locationId: 'l1', amount: '4440.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('4440.00')
      expect(res.reductions).toEqual([
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-16', amount: '4440.00' },
      ])
    })

    it('matches exact amounts across multiple bills (case 2)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2022-03-31', balance: '182000000.00' },
        { invoiceId: 'b2', partyId: 'v1', locationId: 'l1', dueDate: '2022-03-31', balance: '445000000.00' },
      ]
      const pools: CreditPool[] = [{ partyId: 'v1', locationId: 'l1', amount: '627000000.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('627000000.00')
      const sortedReductions = [...res.reductions].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId))
      expect(sortedReductions).toEqual([
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2022-03-31', amount: '182000000.00' },
        { invoiceId: 'b2', partyId: 'v1', locationId: 'l1', dueDate: '2022-03-31', amount: '445000000.00' },
      ])
    })

    it('is bounded by bill total when pool is larger (case 3)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
      ]
      const pools: CreditPool[] = [{ partyId: 'v1', locationId: 'l1', amount: '250.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('100.00')
      expect(res.reductions).toEqual([
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', amount: '100.00' },
      ])
    })

    it('does not reduce bills in different entities (case 4)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
      ]
      const pools: CreditPool[] = [{ partyId: 'v1', locationId: 'l2', amount: '50.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('0.00')
      expect(res.reductions).toEqual([])
    })

    it('reduces earliest due date bills first (case 5)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-20', balance: '100.00' },
        { invoiceId: 'b2', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
        { invoiceId: 'b3', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-15', balance: '100.00' },
      ]
      const pools: CreditPool[] = [{ partyId: 'v1', locationId: 'l1', amount: '150.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('150.00')
      expect(res.reductions).toEqual([
        { invoiceId: 'b2', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', amount: '100.00' },
        { invoiceId: 'b3', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-15', amount: '50.00' },
      ])
    })

    it('breaks due-date ties by bill ID (case 6)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b2', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
      ]
      const pools: CreditPool[] = [{ partyId: 'v1', locationId: 'l1', amount: '150.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('150.00')
      expect(res.reductions).toEqual([
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', amount: '100.00' },
        { invoiceId: 'b2', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', amount: '50.00' },
      ])
    })

    it('handles multiple distinct pools independently (case 7)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
        { invoiceId: 'b2', partyId: 'v2', locationId: 'l1', dueDate: '2026-06-10', balance: '20.00' },
      ]
      const pools: CreditPool[] = [
        { partyId: 'v1', locationId: 'l1', amount: '30.00' },
        { partyId: 'v2', locationId: 'l1', amount: '50.00' },
      ]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('50.00')
      const sortedReductions = [...res.reductions].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId))
      expect(sortedReductions).toEqual([
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', amount: '30.00' },
        { invoiceId: 'b2', partyId: 'v2', locationId: 'l1', dueDate: '2026-06-10', amount: '20.00' },
      ])
    })

    it('ignores pools without a party ID (case 8)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
      ]
      const pools: CreditPool[] = [{ partyId: '', locationId: 'l1', amount: '50.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('0.00')
      expect(res.reductions).toEqual([])
    })

    it('ignores zero or negative pool amounts (case 9)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '100.00' },
      ]
      const pools: CreditPool[] = [
        { partyId: 'v1', locationId: 'l1', amount: '0.00' },
        { partyId: 'v1', locationId: 'l1', amount: '-5.00' },
      ]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('0.00')
      expect(res.reductions).toEqual([])
    })

    it('ignores bills with zero or negative balance (case 10)', () => {
      const bills: CreditableBill[] = [
        { invoiceId: 'b1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '0.00' },
        { invoiceId: 'b2', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '-10.00' },
      ]
      const pools: CreditPool[] = [{ partyId: 'v1', locationId: 'l1', amount: '50.00' }]
      const res = applyCredits(bills, pools)
      expect(res.applied).toBe('0.00')
      expect(res.reductions).toEqual([])
    })

    it('does not mutate frozen input structures (case 11)', () => {
      const bill = Object.freeze({
        invoiceId: 'b1',
        partyId: 'v1',
        locationId: 'l1',
        dueDate: '2026-06-10',
        balance: '100.00',
      })
      const pool = Object.freeze({ partyId: 'v1', locationId: 'l1', amount: '30.00' })
      const bills = Object.freeze([bill])
      const pools = Object.freeze([pool])
      expect(() => applyCredits(bills, pools)).not.toThrow()
    })
  })

  describe('creditPoolsFromItems', () => {
    it('aggregates balances below zero per (party, entity) and ignores positives and empty parties', () => {
      const items = [
        { partyId: 'v1', locationId: 'l1', balance: '-4440.00' },
        { partyId: 'v1', locationId: 'l1', balance: '-100.00' },
        { partyId: 'v1', locationId: 'l1', balance: '22200.00' },
        { partyId: 'v2', locationId: 'l1', balance: '-50.00' },
        { partyId: '', locationId: 'l1', balance: '-9.00' },
      ]
      const pools = creditPoolsFromItems(items).sort((a, b) => a.partyId.localeCompare(b.partyId))
      expect(pools).toEqual([
        { partyId: 'v1', locationId: 'l1', amount: '4540.00' },
        { partyId: 'v2', locationId: 'l1', amount: '50.00' },
      ])
    })
  })

  describe('subtractReductions', () => {
    it('subtracts reductions from total and plan statuses', () => {
      const totals: DueTotals = {
        total: new Map([['2026-06-15', '300.00']]),
        approved: new Map([['2026-06-15', '100.00']]),
        submitted: new Map(),
      }
      const reductions = [
        { invoiceId: 'i1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-15', amount: '40.00' },
        { invoiceId: 'i2', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-15', amount: '20.00' },
      ]
      const statusOf = (id: string) => (id === 'i1' ? 'approved' : 'notSubmitted')
      const res = subtractReductions(totals, reductions, statusOf)

      expect(res.total.get('2026-06-15')).toBe('240.00')
      expect(res.approved.get('2026-06-15')).toBe('60.00')
      expect(res.submitted.get('2026-06-15')).toBeUndefined()
      // Original map inputs are not changed
      expect(totals.total.get('2026-06-15')).toBe('300.00')
      expect(totals.approved.get('2026-06-15')).toBe('100.00')
    })
  })
})
