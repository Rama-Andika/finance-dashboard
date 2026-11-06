import { describe, expect, it } from 'vitest'
import { createSettlementSums } from './settlement-sums'
import { openBalance } from './open-invoices'

// AR direct return: the return card has no detail rows of its own. A settlement card (type 1) later allocates to it:
// a detail row with the return as `invoice_id` (+amount) and one with the invoice (-amount).
describe('AR direct return remaining balance', () => {
  const returnBalance = (original: string, sums: Map<string, string>, id: string) => openBalance(original, sums.get(id))

  it('is left out when a settlement card used all of it', () => {
    const sums = createSettlementSums(new Set(['pay1']))
    sums.add('ret1', 'pay1', '200000.00') // +200000 to the return
    sums.add('inv1', 'pay1', '-600000.00') // -600000 to the invoice
    expect(returnBalance('-200000.00', sums.result(), 'ret1')).toBeNull()
    expect(openBalance('600000.00', sums.result().get('inv1'))).toBeNull()
  })

  it('keeps what is left when a settlement card used part of it', () => {
    const sums = createSettlementSums(new Set(['pay1']))
    sums.add('ret1', 'pay1', '50000.00')
    expect(returnBalance('-200000.00', sums.result(), 'ret1')).toEqual({
      original: '-200000.00',
      balance: '-150000.00',
    })
  })

  it('keeps the full amount when nothing allocated to it', () => {
    const sums = createSettlementSums(new Set(['pay1']))
    sums.add('inv1', 'pay1', '-600000.00')
    expect(returnBalance('-200000.00', sums.result(), 'ret1')).toEqual({
      original: '-200000.00',
      balance: '-200000.00',
    })
  })

  it('ignores allocations of cards that are not settlement cards of the date (for example dated after it)', () => {
    const sums = createSettlementSums(new Set(['pay1'])) // pay2 is not in the set
    sums.add('ret1', 'pay2', '200000.00')
    expect(returnBalance('-200000.00', sums.result(), 'ret1')).toEqual({
      original: '-200000.00',
      balance: '-200000.00',
    })
  })

  it('adds the allocations of several settlement cards', () => {
    const sums = createSettlementSums(new Set(['pay1', 'pay2']))
    sums.add('ret1', 'pay1', '80000.00')
    sums.add('ret1', 'pay2', '120000.00')
    expect(returnBalance('-200000.00', sums.result(), 'ret1')).toBeNull()
  })
})
