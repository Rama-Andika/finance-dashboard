import { describe, expect, it } from 'vitest'
import { assetsComposition, groupLabelKey, liabilitiesEquityComposition } from './labels'

const totals = {
  'Liquid Assets': '200.00',
  'Fixed Assets': '100.00',
  'Other Assets': '0.00',
  'Current Liabilities': '80.00',
  'Long Term Liabilities': '20.00',
  Equity: '200.00',
}

describe('groupLabelKey', () => {
  it('names the i18n key of every balance sheet group', () => {
    expect(groupLabelKey('Liquid Assets')).toBe('balanceSheet.group.liquidAssets')
    expect(groupLabelKey('Fixed Assets')).toBe('balanceSheet.group.fixedAssets')
    expect(groupLabelKey('Other Assets')).toBe('balanceSheet.group.otherAssets')
    expect(groupLabelKey('Current Liabilities')).toBe('balanceSheet.group.currentLiabilities')
    expect(groupLabelKey('Long Term Liabilities')).toBe('balanceSheet.group.longTermLiabilities')
    expect(groupLabelKey('Equity')).toBe('balanceSheet.group.equity')
  })
})

describe('compositions', () => {
  it('lists the three asset groups with their totals', () => {
    expect(assetsComposition(totals)).toEqual([
      { id: 'Liquid Assets', labelKey: 'balanceSheet.group.liquidAssets', amount: '200.00' },
      { id: 'Fixed Assets', labelKey: 'balanceSheet.group.fixedAssets', amount: '100.00' },
      { id: 'Other Assets', labelKey: 'balanceSheet.group.otherAssets', amount: '0.00' },
    ])
  })

  it('lists liabilities and equity on the other side', () => {
    expect(liabilitiesEquityComposition(totals).map((i) => [i.id, i.amount])).toEqual([
      ['Current Liabilities', '80.00'],
      ['Long Term Liabilities', '20.00'],
      ['Equity', '200.00'],
    ])
  })

  it('treats a missing total as zero', () => {
    expect(assetsComposition({}).map((i) => i.amount)).toEqual(['0.00', '0.00', '0.00'])
  })
})
