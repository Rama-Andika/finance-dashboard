import { describe, expect, it } from 'vitest'
import { classifyByFallback, classifyBySetup, type CfSetupRow } from './cashflow'
import { CF_FALLBACK, UNCLASSIFIED_SUBGROUP } from './cashflow-labels'

describe('classifyByFallback: the rules and their order', () => {
  const counter = (accountGroup: string, subAccountGroup = '') => ({ accountGroup, subAccountGroup })

  const cases: Array<[string, ReturnType<typeof counter>, string, number, string, string]> = [
    // [name, counter, portion, journalType, drawer, subGroup]
    ['loan journal', counter('Expense'), '-10', 11, 'FUNDING', CF_FALLBACK.bankLoan],
    ['fixed asset journal, outflow', counter('Expense'), '-10', 44, 'INVESTING', CF_FALLBACK.assetPurchase],
    ['fixed asset account, inflow', counter('Fixed Assets'), '10', 0, 'INVESTING', CF_FALLBACK.assetSale],
    ['other assets account, outflow', counter('Other Assets'), '-10', 0, 'INVESTING', CF_FALLBACK.assetPurchase],
    ['equity inflow', counter('Equity'), '10', 0, 'FUNDING', CF_FALLBACK.capitalContribution],
    ['equity outflow', counter('Equity'), '-10', 0, 'FUNDING', CF_FALLBACK.ownerDrawings],
    ['long term liabilities', counter('Long Term Liabilities'), '10', 0, 'FUNDING', CF_FALLBACK.longTermLoan],
    ['revenue', counter('Revenue'), '10', 0, 'OPERATING', CF_FALLBACK.customerReceipts],
    [
      'account receivable',
      counter('Liquid Assets', 'Account Receivable'),
      '10',
      0,
      'OPERATING',
      CF_FALLBACK.customerReceipts,
    ],
    [
      'account payable',
      counter('Current Liabilities', 'Account Payable'),
      '-10',
      0,
      'OPERATING',
      CF_FALLBACK.supplierPayments,
    ],
    ['inventory', counter('Liquid Assets', 'Inventory'), '-10', 0, 'OPERATING', CF_FALLBACK.supplierPayments],
    ['expense', counter('Expense'), '-10', 0, 'OPERATING', CF_FALLBACK.operatingExpenses],
    ['cost of sales', counter('Cost Of Sales'), '-10', 0, 'OPERATING', CF_FALLBACK.operatingExpenses],
    [
      'receivable other',
      counter('Liquid Assets', 'Account Receivable Other'),
      '-10',
      0,
      'OPERATING',
      CF_FALLBACK.operatingExpenses,
    ],
    ['other expense', counter('Other Expense'), '-10', 0, 'OPERATING', CF_FALLBACK.interestAndFees],
    ['other revenue', counter('Other Revenue'), '10', 0, 'OPERATING', CF_FALLBACK.otherIncome],
    // an earlier rule wins over a later one
    ['loan journal beats equity', counter('Equity'), '10', 12, 'FUNDING', CF_FALLBACK.bankLoan],
    ['asset journal beats equity', counter('Equity'), '10', 49, 'INVESTING', CF_FALLBACK.assetSale],
  ]

  it.each(cases)('%s', (_name, c, portion, journalType, drawer, subGroup) => {
    expect(classifyByFallback(portion, c, journalType)).toEqual({ drawer, subGroup })
  })

  it('marks what no rule covers as unclassified operating', () => {
    expect(classifyByFallback('10', counter('Liquid Assets', 'Something else'), 0)).toEqual({
      drawer: 'OPERATING',
      subGroup: UNCLASSIFIED_SUBGROUP,
      unclassified: true,
    })
  })
})

describe('classifyBySetup: which sub row wins', () => {
  const row = (
    groupName: string,
    groupSequence: number,
    subGroup: string,
    subSequence: number,
    valueDisplayed: 0 | 1,
  ): CfSetupRow => ({
    groupName,
    groupSequence,
    subGroup,
    subSequence,
    valueDisplayed,
    accountGroup: 'Expense',
    subAccountGroup: '',
  })
  const counter = { accountGroup: 'Expense', subAccountGroup: '' }

  it('takes only the sub rows that accept the direction of the portion', () => {
    const setup = [row('Operating', 1, 'Paid', 1, 1), row('Operating', 1, 'Received', 2, 0)]
    expect(classifyBySetup('-5', counter, setup)).toEqual({ drawer: 'OPERATING', subGroup: 'Paid' })
    expect(classifyBySetup('5', counter, setup)).toEqual({ drawer: 'OPERATING', subGroup: 'Received' })
  })

  it('lets a sub row with both kinds of rows take any direction', () => {
    const setup = [row('Operating', 1, 'Both', 1, 0), row('Operating', 1, 'Both', 1, 1)]
    expect(classifyBySetup('5', counter, setup)).toEqual({ drawer: 'OPERATING', subGroup: 'Both' })
    expect(classifyBySetup('-5', counter, setup)).toEqual({ drawer: 'OPERATING', subGroup: 'Both' })
  })

  it('prefers the lower group sequence, then the lower sub sequence, then the earlier row', () => {
    const setup = [
      row('Investing activities', 2, 'Late group', 1, 1),
      row('Operating', 1, 'Second sub', 5, 1),
      row('Operating', 1, 'First sub', 3, 1),
      row('Operating', 1, 'Tie', 3, 1),
    ]
    expect(classifyBySetup('-5', counter, setup)).toEqual({ drawer: 'OPERATING', subGroup: 'First sub' })
  })

  it('maps the group name to a drawer', () => {
    expect(classifyBySetup('-5', counter, [row('Investing activities', 1, 'A', 1, 1)])?.valueOf()).toEqual({
      drawer: 'INVESTING',
      subGroup: 'A',
    })
    expect(classifyBySetup('-5', counter, [row('Financing', 1, 'B', 1, 1)])).toEqual({
      drawer: 'FUNDING',
      subGroup: 'B',
    })
  })

  it('is unclassified when no sub row matches the account or the direction', () => {
    expect(classifyBySetup('5', counter, [row('Operating', 1, 'Paid', 1, 1)])).toBe('UNCLASSIFIED')
    expect(
      classifyBySetup('-5', { accountGroup: 'Revenue', subAccountGroup: '' }, [row('Operating', 1, 'Paid', 1, 1)]),
    ).toBe('UNCLASSIFIED')
  })

  it('answers the same when the same setup list is used again, and reads a new list afresh', () => {
    const first = [row('Operating', 1, 'Paid', 1, 1)]
    expect(classifyBySetup('-5', counter, first)).toEqual({ drawer: 'OPERATING', subGroup: 'Paid' })
    expect(classifyBySetup('-7', counter, first)).toEqual({ drawer: 'OPERATING', subGroup: 'Paid' })
    expect(classifyBySetup('5', counter, first)).toBe('UNCLASSIFIED')

    const second = [row('Investing activities', 1, 'Capex', 1, 1)]
    expect(classifyBySetup('-5', counter, second)).toEqual({ drawer: 'INVESTING', subGroup: 'Capex' })
  })

  it('keeps the sub rows of different counter account types apart', () => {
    const setup = [
      row('Operating', 1, 'Paid', 1, 1),
      { ...row('Financing', 2, 'Loan paid', 1, 1), accountGroup: 'Long Term Liabilities' },
    ]
    const loan = { accountGroup: 'Long Term Liabilities', subAccountGroup: '' }
    expect(classifyBySetup('-5', counter, setup)).toEqual({ drawer: 'OPERATING', subGroup: 'Paid' })
    expect(classifyBySetup('-5', loan, setup)).toEqual({ drawer: 'FUNDING', subGroup: 'Loan paid' })
    expect(classifyBySetup('-5', counter, setup)).toEqual({ drawer: 'OPERATING', subGroup: 'Paid' })
  })
})
