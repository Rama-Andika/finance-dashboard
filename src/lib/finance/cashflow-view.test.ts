import { describe, expect, it } from 'vitest'
import { buildActivityRows, buildWaterfall, localizeExpense } from './cashflow-view'
import { CF_FALLBACK } from './cashflow-labels'

const t = (key: string) => `T(${key})`

describe('cash flow page data', () => {
  const drawers = [
    {
      drawer: 'OPERATING' as const,
      total: '70.00',
      rows: [
        { subGroup: CF_FALLBACK.customerReceipts, amount: '100.00' },
        { subGroup: 'Unclassified', amount: '-30.00', unclassified: true },
      ],
    },
    { drawer: 'INVESTING' as const, total: '-20.00', rows: [] },
    { drawer: 'FUNDING' as const, total: '0.00', rows: [] },
  ]

  it('builds the waterfall: opening, three activities, closing, coloured by sign', () => {
    const bars = buildWaterfall({ openingCash: '10.00', closingCash: '60.00', drawers }, t)
    expect(bars.map((b) => b.name)).toEqual([
      'T(metric.openingCash)',
      'T(metric.operating)',
      'T(metric.investing)',
      'T(metric.financing)',
      'T(metric.closingCash)',
    ])
    expect(bars.map((b) => b.amountNum)).toEqual([10, 70, -20, 0, 60])
    expect(bars[1]!.color).toBe('var(--chart-income)')
    expect(bars[2]!.color).toBe('var(--chart-expense)')
    expect(bars[2]!.rawAmount).toBe('-20.00') // the exact string is kept for the tooltip
  })

  it('lists a header row per activity followed by its sub-rows, translating fallback keys only', () => {
    const rows = buildActivityRows(drawers, t)
    expect(rows.map((r) => r.id)).toEqual([
      'drawer-OPERATING',
      `row-OPERATING-${CF_FALLBACK.customerReceipts}`,
      'row-OPERATING-Unclassified',
      'drawer-INVESTING',
      'drawer-FUNDING',
    ])
    expect(rows[1]!.name).toBe(`T(${CF_FALLBACK.customerReceipts})`)
    expect(rows[2]!.name).toBe('T(ui.col.unclassified)')
    expect(rows[0]!.isDrawerHeader).toBe(true)
  })

  it('translates the fixed expense categories and unknown vendors, children included', () => {
    const out = localizeExpense(
      {
        id: 'apBills',
        label: 'AP bill payments',
        amount: '5.00',
        children: [
          { id: 'v1', label: '', amount: '5.00' },
          { id: 'v2', label: 'Acme', amount: '0.00' },
        ],
      },
      t,
    )
    expect(out.label).toBe('T(ui.col.apBills)')
    expect(out.children!.map((c) => c.label)).toEqual(['T(ui.col.unknownVendor)', 'Acme'])
  })
})
