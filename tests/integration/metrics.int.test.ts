import { describe, expect, it, beforeAll } from 'vitest'
import { resolveFilter, type AppContextFilter } from '~/server/context'
import { computeCashPosition } from '~/server/services/cash-position.service'
import { computeRevenue } from '~/server/services/revenue.service'
import { computePnl } from '~/server/services/pnl.service'
import { computeCashFlow } from '~/server/services/cash-flow.service'
import { computeExpensePaid } from '~/server/services/expense-paid.service'
import { computeApAging } from '~/server/services/ap-aging.service'
import { computeArAging } from '~/server/services/ar-aging.service'
import { computeFixedCost } from '~/server/services/fixed-cost.service'
import { computePaymentPlan } from '~/server/services/payment-plan.service'
import { computeBudget } from '~/server/services/budget.service'
import { computeRunwayMetrics } from '~/server/services/runway.service'
import { computeSummary } from '~/server/services/summary.service'
import { computeDrill } from '~/server/services/drill.service'
import { computeDataChecks } from '~/server/services/data-checks.service'

const MONEY_REGEX = /^-?\d+(\.\d{2})?$/
const TEST_TIMEOUT = 300000

describe('Metrics DB Integration Tests', () => {
  let filter: AppContextFilter
  let apFilter: AppContextFilter

  beforeAll(async () => {
    filter = await resolveFilter({
      entity: 'all',
      preset: 'last-month',
      p13: false,
    })
    // Single entity '272' (CM BANDARA R17) allows fast AP aging verification on 2.1M row demo DB
    apFilter = await resolveFilter({
      entity: '272',
      preset: 'last-month',
      p13: false,
    })
  })

  it('1. Cash Position', { timeout: TEST_TIMEOUT }, async () => {
    const cashPos = await computeCashPosition(filter)
    expect(cashPos.cashPosition).toMatch(MONEY_REGEX)
    expect(cashPos.cash).toMatch(MONEY_REGEX)
    expect(cashPos.bank).toMatch(MONEY_REGEX)
    expect(cashPos.deposit).toMatch(MONEY_REGEX)
    expect(cashPos.inTransit).toMatch(MONEY_REGEX)
  })

  it('2. Revenue', { timeout: TEST_TIMEOUT }, async () => {
    const revenue = await computeRevenue(filter)
    expect(revenue.total).toMatch(MONEY_REGEX)
    expect(Array.isArray(revenue.trend)).toBe(true)
  })

  it('3. PnL', { timeout: TEST_TIMEOUT }, async () => {
    const pnl = await computePnl(filter)
    expect(pnl.lines.length).toBeGreaterThan(0)
    for (const line of pnl.lines) {
      expect(line.amount).toMatch(MONEY_REGEX)
    }
  })

  it('4. Cash Flow', { timeout: TEST_TIMEOUT }, async () => {
    const cashFlow = await computeCashFlow(filter)
    expect(cashFlow.netCashFlow).toMatch(MONEY_REGEX)
    expect(cashFlow.openingCash).toMatch(MONEY_REGEX)
    expect(cashFlow.closingCash).toMatch(MONEY_REGEX)
    expect(cashFlow.closingCashByBalance).toMatch(MONEY_REGEX)
    expect(typeof cashFlow.identityOk).toBe('boolean')
  })

  it('5. Expense Paid', { timeout: TEST_TIMEOUT }, async () => {
    const expPaid = await computeExpensePaid(filter)
    expect(expPaid.total).toMatch(MONEY_REGEX)
    expect(expPaid.apPayments).toMatch(MONEY_REGEX)
    expect(expPaid.unallocatedPayments).toMatch(MONEY_REGEX)
    expect(expPaid.directPayments).toMatch(MONEY_REGEX)
  })

  it('6. AP Aging', { timeout: TEST_TIMEOUT }, async () => {
    const apAging = await computeApAging(apFilter)
    expect(apAging.total).toMatch(MONEY_REGEX)
    expect(apAging.unpaidBills).toMatch(MONEY_REGEX)
    expect(apAging.overdueSubtotal).toMatch(MONEY_REGEX)
  })

  it('7. AR Aging', { timeout: TEST_TIMEOUT }, async () => {
    const arAging = await computeArAging(filter)
    expect(arAging.total).toMatch(MONEY_REGEX)
    expect(arAging.unpaidInvoices).toMatch(MONEY_REGEX)
    expect(arAging.nonTrade).toMatch(MONEY_REGEX)
  })

  it('8. Fixed Cost', { timeout: TEST_TIMEOUT }, async () => {
    const fixedCost = await computeFixedCost(filter)
    expect(fixedCost.averageFixed).toMatch(MONEY_REGEX)
    expect(Array.isArray(fixedCost.months)).toBe(true)
  })

  it('9. Payment Plan', { timeout: TEST_TIMEOUT }, async () => {
    const paymentPlan = await computePaymentPlan(apFilter, {
      horizon: '7',
      inflow: false,
    })
    expect(paymentPlan.openingBalance).toMatch(MONEY_REGEX)
    expect(paymentPlan.overdue).toMatch(MONEY_REGEX)
    expect(paymentPlan.days).toHaveLength(7)
  })

  it('10. Budget vs Actual', { timeout: TEST_TIMEOUT }, async () => {
    const budget = await computeBudget(filter)
    expect(budget.summary.actual).toMatch(MONEY_REGEX)
    expect(budget.summary.budget).toMatch(MONEY_REGEX)
    expect(budget.summary.variance).toMatch(MONEY_REGEX)
  })

  it('11. Runway', { timeout: TEST_TIMEOUT }, async () => {
    const runway = await computeRunwayMetrics(apFilter)
    expect(runway.avgBurn).toMatch(MONEY_REGEX)
    expect(typeof runway.cashFlowPositive).toBe('boolean')
  })

  it('12. Summary Composition', { timeout: TEST_TIMEOUT }, async () => {
    const summary = await computeSummary(apFilter)
    expect(summary.meta.readAt).toBeDefined()
    expect(summary.cashPosition.total).toMatch(MONEY_REGEX)
    expect(summary.revenue.total).toMatch(MONEY_REGEX)
    expect(summary.pnl.netProfit).toMatch(MONEY_REGEX)
  })

  it('13. Drill-Down Service (Folder -> Account -> Entity -> Journal)', { timeout: TEST_TIMEOUT }, async () => {
    // 1. Folder drill
    const folderDrill = await computeDrill(filter, {
      metric: 'revenue',
      steps: [{ kind: 'folder', id: '4000', label: 'Pendapatan Usaha' }],
    })
    expect(folderDrill.columns.length).toBeGreaterThan(0)
    expect(folderDrill.nextKind).toBe('account')

    // 2. Account drill (on single entity filter goes directly to journal, or on 'all' goes to entity)
    const accountDrillAll = await computeDrill(filter, {
      metric: 'revenue',
      steps: [
        { kind: 'folder', id: '4000', label: 'Pendapatan Usaha' },
        { kind: 'account', id: '4100', label: 'Penjualan' },
      ],
    })
    expect(accountDrillAll.columns.length).toBeGreaterThan(0)
    expect(accountDrillAll.nextKind).toBe('entity')

    // 3. Entity drill -> leaf journals
    const entityDrill = await computeDrill(filter, {
      metric: 'revenue',
      steps: [
        { kind: 'folder', id: '4000', label: 'Pendapatan Usaha' },
        { kind: 'account', id: '4100', label: 'Penjualan' },
        { kind: 'entity', id: '272', label: 'CM BANDARA R17' },
      ],
    })
    expect(entityDrill.columns.some((c) => c.id === 'journalNumber')).toBe(true)
    expect(entityDrill.nextKind).toBeNull()
  })

  it('14. Data Checks Panel (Q9, CF_UNCLASSIFIED, Consistency)', { timeout: TEST_TIMEOUT }, async () => {
    const checks = await computeDataChecks(apFilter)
    expect(Array.isArray(checks)).toBe(true)

    // Q9 finding check on demo DB
    const q9 = checks.find((c) => c.code === 'Q9')
    if (q9) {
      expect(q9.count).toBeGreaterThan(0)
      expect(q9.level).toBe('warning')
      expect(q9.link).toBe('/cash-position')
    }

    // Cash flow finding check on demo DB
    const cfFinding = checks.find((c) => c.code === 'CF_UNCLASSIFIED')
    if (cfFinding) {
      expect(cfFinding.level).toBe('warning')
      expect(cfFinding.link).toBe('/cash-flow')
    }
  })
})
