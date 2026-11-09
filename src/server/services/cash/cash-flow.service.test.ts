import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree, type CoaRow } from '~/lib/finance/coa/coa-tree'
import type { Period } from '~/lib/core/types'
import type { CfLine, CfSetupRow } from '~/lib/finance/cash/cashflow'
import { CF_FALLBACK } from '~/lib/finance/cash/cashflow-labels'

const account = (coaId: string, code: string, accountGroup: string, subAccountGroup: string): CoaRow => ({
  coaId,
  parentId: '0',
  code,
  name: `Account ${code}`,
  status: 'POSTABLE',
  level: 1,
  accountGroup: accountGroup as CoaRow['accountGroup'],
  subAccountGroup,
  saldoNormal: 'DEBET',
})
const tree = buildCoaTree([
  account('1110', '1-1110', 'Liquid Assets', 'Cash'),
  account('1120', '1-1120', 'Liquid Assets', 'Bank'),
  account('4110', '4-4110', 'Revenue', ''),
  account('6110', '6-6110', 'Expense', ''),
])
const periods: Period[] = [
  {
    periodeId: 'p1',
    name: 'Oct',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: 'Closed',
    type: 0,
    tableName: 'gl',
  },
]

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => periods,
  buildMetricMeta: () => ({
    readAt: 'now',
    d1: '2026-10-01',
    asOf: '2026-10-31',
    today: '2026-10-31',
    entityCount: 1,
    isAllEntities: true,
    hasOpenPeriod: false,
    missingMonths: [],
  }),
}))
vi.mock('~/server/services/shared/resolved-baskets', () => ({
  loadResolvedBaskets: async () => ({
    cash: ['1110'],
    bank: ['1120'],
    deposit: [],
    inTransit: [],
    fixedCost: [],
    missing: [],
  }),
}))

const line = (glId: string, coaId: string, debet: string, credit: string): CfLine => ({
  glId,
  journalType: 1,
  periodId: 'p1',
  coaId,
  segmentDetailId: 'sd1',
  debet,
  credit,
})
let lines: CfLine[] = []
let setup: CfSetupRow[] = []
vi.mock('~/server/repo/cash/cashflow.repo', () => ({
  linesOfCashJournals: async () => lines,
  getCashFlowSetup: async () => setup,
}))
vi.mock('~/server/services/cash/balance.service', () => ({
  // opening (the day before the first day) and closing balances of the two cash accounts
  balancesAt: async ({ asOf }: { asOf: string }) => ({
    byCoa:
      asOf === '2026-09-30'
        ? new Map([
            ['1110', '1000.00'],
            ['1120', '0.00'],
          ])
        : new Map([
            ['1110', '1050.00'],
            ['1120', '10.00'],
          ]),
    method: 'opening-table',
  }),
}))

const { computeCashFlow, loadClassifiedPortions } = await import('./cash-flow.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  locationIds: 'all' as const,
  segmentDetailIds: 'all' as const,
  d1: '2026-10-01',
  asOf: '2026-10-31',
  periodIds: ['p1'],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
  today: '2026-10-31',
  entitySegmentColumn: 'segment1_id',
  entityCount: 1,
  hasOpenPeriod: false,
  months: ['2026-10'],
  missingMonths: [] as string[],
}

describe('computeCashFlow', () => {
  beforeEach(() => {
    clearCache()
    setup = []
    lines = [
      // customer receipt: cash in 100 against revenue
      line('a', '1110', '100.00', '0.00'),
      line('a', '4110', '0.00', '100.00'),
      // expense paid in cash: cash out 40
      line('b', '1110', '0.00', '40.00'),
      line('b', '6110', '40.00', '0.00'),
      // transfer between two cash accounts: not a cash movement of the company
      line('c', '1110', '0.00', '10.00'),
      line('c', '1120', '10.00', '0.00'),
    ]
  })

  it('classifies the cash portions by the fallback rules when the cash flow setup is empty', async () => {
    const result = await computeCashFlow(filter)

    expect(result.source).toBe('fallback')
    expect(result.openingCash).toBe('1000.00')
    expect(result.netCashFlow).toBe('60.00')
    expect(result.closingCash).toBe('1060.00')
    expect(result.closingCashByBalance).toBe('1060.00')
    expect(result.identityOk).toBe(true)

    const operating = result.drawers.find((d) => d.drawer === 'OPERATING')
    expect(operating?.total).toBe('60.00')
    expect(operating?.rows).toEqual([
      { subGroup: CF_FALLBACK.customerReceipts, amount: '100.00', unclassified: undefined },
      { subGroup: CF_FALLBACK.operatingExpenses, amount: '-40.00', unclassified: undefined },
    ])
    expect(result.drawers.find((d) => d.drawer === 'INVESTING')?.total).toBe('0.00')
    expect(result.drawers.find((d) => d.drawer === 'FUNDING')?.total).toBe('0.00')
    expect(result.monthly).toEqual([{ month: '2026-10', cashIn: '100.00', cashOut: '40.00', net: '60.00' }])
    // the ERP method (full counter lines) gives the same totals here, so nothing differs
    expect(result.erpComparison.map((c) => c.diff)).toEqual(['0.00', '0.00', '0.00'])
  })

  it('classifies by the cash flow setup when it is valid', async () => {
    setup = [
      {
        groupName: 'Operating',
        groupSequence: 1,
        subGroup: 'Sales receipts',
        subSequence: 1,
        valueDisplayed: 0,
        accountGroup: 'Revenue',
        subAccountGroup: '',
      },
      {
        groupName: 'Operating',
        groupSequence: 1,
        subGroup: 'Expenses paid',
        subSequence: 2,
        valueDisplayed: 1,
        accountGroup: 'Expense',
        subAccountGroup: '',
      },
    ]
    const result = await computeCashFlow(filter)

    expect(result.source).toBe('setup')
    expect(result.drawers.find((d) => d.drawer === 'OPERATING')?.rows).toEqual([
      { subGroup: 'Sales receipts', amount: '100.00', unclassified: undefined },
      { subGroup: 'Expenses paid', amount: '-40.00', unclassified: undefined },
    ])
  })

  it('hands the drill-down the same portions the metric used', async () => {
    const classified = await loadClassifiedPortions(filter)
    expect(classified.portions.map((p) => [p.glId, p.counterCoaId, p.portion])).toEqual([
      ['a', '4110', '100.00'],
      ['b', '6110', '-40.00'],
    ])
  })
})
