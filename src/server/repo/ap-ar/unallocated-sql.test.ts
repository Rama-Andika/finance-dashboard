import { describe, expect, it } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'
import { AGING_SIDES } from '~/server/db/erp-codes'
import { directReturnsQuery, paymentsWithoutDetailQuery, unallocatedQuery } from './unallocated-sql'

const dialect = new MySqlDialect()
const compile = (query: SQL) => dialect.sqlToQuery(query)
const AS_OF = '2026-06-16'

describe('paymentsWithoutDetailQuery (AP)', () => {
  const query = compile(paymentsWithoutDetailQuery(AGING_SIDES.ap, AS_OF, undefined))

  it('lists the payment cards that have no detail row of their own, at their full signed amount', () => {
    expect(query.sql).toContain('FROM ap_ar_card p')
    expect(query.sql).toContain('p.amount * p.in_out AS balance')
    expect(query.sql).toContain('AND p.transaction_type IN (7, 8, 9, 10, 11, 13, 14)')
    expect(query.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)',
    )
  })

  it('does not group or sum: nothing allocates to a payment card', () => {
    expect(query.sql).not.toContain('GROUP BY')
    expect(query.sql).not.toContain('HAVING')
  })

  it('sends the module and the date as parameters, and only filters locations when given a slice', () => {
    expect(query.params).toEqual([0, AS_OF])
    expect(query.sql).not.toContain('location_id IN')
    const sliced = compile(paymentsWithoutDetailQuery(AGING_SIDES.ap, AS_OF, ['5', '6']))
    expect(sliced.sql).toContain('`p`.location_id IN (?, ?)')
    expect(sliced.params).toEqual([0, AS_OF, '5', '6'])
  })
})

describe('directReturnsQuery (AR)', () => {
  const query = compile(directReturnsQuery(AGING_SIDES.ar, AS_OF, undefined))

  it('subtracts the allocations that name the return, from settlement cards of the side dated before the day', () => {
    expect(query.sql).toContain('LEFT JOIN ap_ar_card_detail d ON d.invoice_id = r.ap_ar_card_id')
    expect(query.sql).toContain('AND p.transaction_type IN (1, 2)')
    expect(query.sql).toContain('AND p.transaction_date < ?')
    expect(query.sql).toContain(
      'r.amount * r.in_out + COALESCE(SUM(CASE WHEN p.ap_ar_card_id IS NOT NULL THEN d.amount END), 0) AS balance',
    )
  })

  it('takes only returns without a detail row of their own, and leaves out a return used up completely', () => {
    expect(query.sql).toContain('AND r.transaction_type IN (2)')
    expect(query.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM ap_ar_card_detail o WHERE o.ap_ar_card_id = r.ap_ar_card_id)',
    )
    expect(query.sql).toContain('HAVING balance <> 0')
  })

  it('groups by every selected column that is not summed (ONLY_FULL_GROUP_BY)', () => {
    expect(query.sql).toContain(
      'GROUP BY r.ap_ar_card_id, r.owner_id, r.location_id, r.coa_id, DATE(r.transaction_date), r.amount, r.in_out',
    )
  })

  it('sends the date and the module as parameters, and filters locations on the return card', () => {
    // In the order the placeholders appear in the text: the join (date, module), then the where clause (module, date)
    expect(query.params).toEqual([AS_OF, 1, 1, AS_OF])
    const sliced = compile(directReturnsQuery(AGING_SIDES.ar, AS_OF, ['5']))
    expect(sliced.sql).toContain('`r`.location_id IN (?)')
    expect(sliced.params).toEqual([AS_OF, 1, 1, AS_OF, '5'])
  })
})

describe('unallocatedQuery', () => {
  it('picks the AR direct returns for AR and the payments without detail for AP', () => {
    expect(compile(unallocatedQuery(AGING_SIDES.ar, AS_OF, ['5'])).sql).toBe(
      compile(directReturnsQuery(AGING_SIDES.ar, AS_OF, ['5'])).sql,
    )
    expect(compile(unallocatedQuery(AGING_SIDES.ap, AS_OF, undefined)).sql).toBe(
      compile(paymentsWithoutDetailQuery(AGING_SIDES.ap, AS_OF, undefined)).sql,
    )
  })
})
