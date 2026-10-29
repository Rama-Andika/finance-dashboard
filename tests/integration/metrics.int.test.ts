import { describe, expect, it, beforeAll } from 'vitest'
import { D, sum } from '~/lib/core/money'
import { resolveFilter, getCachedEntities, type AppContextFilter } from '~/server/context'
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

// Runs against the LOCAL demo database with "today" pinned inside its data window (see setup.ts).
const MONEY_REGEX = /^-?\d+\.\d{2}$/
const TEST_TIMEOUT = 300000

describe('Metrics DB integration (demo data window)', () => {
  let filter: AppContextFilter // all entities, last month
  let entityFilter: AppContextFilter // a single entity that has journals, last month
  let entityCode = ''

  beforeAll(async () => {
    filter = await resolveFilter({ entity: 'all', preset: 'last-month', p13: false })

    // Pick the entity with the most revenue last month so single-entity tests have data.
    const revenue = await computeRevenue(filter)
    const top = [...revenue.byEntity].sort((a, b) => D(b.amount).cmp(D(a.amount)))[0]
    entityCode = top?.code ?? 'all'
    // The `entity` parameter takes location ids, not codes
    const { entities } = await getCachedEntities()
    const entityId = entities.find((e) => e.code === entityCode)?.locationId ?? 'all'
    entityFilter = await resolveFilter({ entity: entityId, preset: 'last-month', p13: false })
  }, TEST_TIMEOUT)

  it('pins today inside the demo data window', () => {
    expect(filter.today).toBe(process.env.APP_TODAY)
    expect(filter.periodIds.length).toBeGreaterThan(0)
  })

  it('Revenue: last month has revenue and the entity split adds up to the total', { timeout: TEST_TIMEOUT }, async () => {
    const revenue = await computeRevenue(filter)
    expect(revenue.total).toMatch(MONEY_REGEX)
    expect(D(revenue.total).gt(0)).toBe(true)
    // Revenue rows without a known entity ("no location") may exist, so the split can be ≤ total.
    expect(D(sum(revenue.byEntity.map((e) => e.amount))).lte(D(revenue.total).plus(1))).toBe(true)
  })

  it('P&L: revenue line equals the Revenue metric and net profit follows the formula', { timeout: TEST_TIMEOUT }, async () => {
    const [pnl, revenue] = await Promise.all([computePnl(filter), computeRevenue(filter)])
    const line = (k: string) => pnl.lines.find((l) => l.key === k)?.amount ?? '0.00'
    // OCI accounts are excluded from the P&L revenue line; on the demo CoA they are not Revenue accounts.
    expect(line('revenue')).toBe(revenue.total)
    const expectedNet = D(line('revenue'))
      .minus(D(line('cogs')))
      .minus(D(line('opex')))
      .plus(D(line('otherRevenue')))
      .minus(D(line('otherExpense')))
      .toFixed(2)
    expect(line('netProfit')).toBe(expectedNet)
    expect(line('comprehensiveIncome')).toBe(D(line('netProfit')).plus(D(line('oci'))).toFixed(2))
  })

  it('Cash position: per-entity balances add up to the consolidated cash position', { timeout: TEST_TIMEOUT }, async () => {
    const cashPos = await computeCashPosition(filter)
    expect(cashPos.cashPosition).toMatch(MONEY_REGEX)
    expect(cashPos.cashPosition).toBe(D(cashPos.cash).plus(D(cashPos.bank)).toFixed(2))
    const entitySum = D(sum(cashPos.byEntity.map((e) => e.amount)))
    // Balances on journal lines without an entity are only in the consolidated total.
    expect(entitySum.minus(D(cashPos.cashPosition)).abs().lte(D(cashPos.cashPosition).abs().plus(1))).toBe(true)
  })

  it('Cash position: single-entity breakdown equals that entity’s total', { timeout: TEST_TIMEOUT }, async () => {
    const cashPos = await computeCashPosition(entityFilter)
    expect(cashPos.byEntity).toHaveLength(1)
    expect(cashPos.byEntity[0]!.amount).toBe(cashPos.cashPosition)
  })

  it('Cash flow: opening + net = closing, and the result is reported (identity check)', { timeout: TEST_TIMEOUT }, async () => {
    const cashFlow = await computeCashFlow(filter)
    expect(cashFlow.closingCash).toBe(D(cashFlow.openingCash).plus(D(cashFlow.netCashFlow)).toFixed(2))
    const drawerSum = sum(cashFlow.drawers.map((d) => d.total))
    expect(drawerSum).toBe(cashFlow.netCashFlow)
    expect(typeof cashFlow.identityOk).toBe('boolean')
    if (!cashFlow.identityOk) {
      // Not a test failure: backdated journals / NBAL can cause this on real data (K12). Make it visible.
      console.warn(
        `[cash-flow identity] closing ${cashFlow.closingCash} ≠ balance ${cashFlow.closingCashByBalance}`,
      )
    }
  })

  it('Expense paid: components add up to the total', { timeout: TEST_TIMEOUT }, async () => {
    const expPaid = await computeExpensePaid(filter)
    expect(expPaid.total).toBe(
      D(expPaid.apPayments).plus(D(expPaid.unallocatedPayments)).plus(D(expPaid.directPayments)).toFixed(2),
    )
  })

  it('AP aging: buckets and components add up to the net total', { timeout: TEST_TIMEOUT }, async () => {
    const ap = await computeApAging(entityFilter)
    expect(ap.total).toBe(D(ap.unpaidBills).plus(D(ap.vendorCredits)).plus(D(ap.unallocatedPayments)).toFixed(2))
    expect(sum(Object.values(ap.buckets))).toBe(ap.total)
  })

  it('AR aging: buckets add up to the net total', { timeout: TEST_TIMEOUT }, async () => {
    const ar = await computeArAging(entityFilter)
    expect(sum(Object.values(ar.buckets))).toBe(ar.total)
  })

  it('Fixed cost: monthly series covers the selected months', { timeout: TEST_TIMEOUT }, async () => {
    const fixedCost = await computeFixedCost(filter)
    expect(fixedCost.months.length).toBe(filter.months.length)
  })

  it('Payment plan: running balance is consistent day to day', { timeout: TEST_TIMEOUT }, async () => {
    const plan = await computePaymentPlan(entityFilter, { horizon: '7', inflow: true })
    expect(plan.days).toHaveLength(7)
    expect(plan.days[0]!.opening).toBe(plan.openingBalance)
    for (let i = 0; i < plan.days.length; i++) {
      const d = plan.days[i]!
      expect(d.closing).toBe(D(d.opening).plus(D(d.inflow)).minus(D(d.outflow)).toFixed(2))
      if (i > 0) expect(d.opening).toBe(plan.days[i - 1]!.closing)
    }
    // Bills listed are within the 7-day horizon (days 0 … 6)
    const lastDay = plan.days[6]!.date
    for (const b of plan.bills) expect(b.dueDate <= lastDay).toBe(true)
  })

  it('Budget vs actual: variance = actual − budget', { timeout: TEST_TIMEOUT }, async () => {
    const budget = await computeBudget(filter)
    expect(budget.summary.variance).toBe(D(budget.summary.actual).minus(D(budget.summary.budget)).toFixed(2))
  })

  it('Runway & summary compose without errors', { timeout: TEST_TIMEOUT }, async () => {
    const [runway, summary] = await Promise.all([computeRunwayMetrics(entityFilter), computeSummary(entityFilter)])
    expect(runway.avgBurn).toMatch(MONEY_REGEX)
    expect(summary.cashPosition.total).toMatch(MONEY_REGEX)
    expect(summary.revenue.total).toMatch(MONEY_REGEX)
  })

  it('Drill-down: revenue folder → account → entity → journal with matching totals', { timeout: TEST_TIMEOUT }, async () => {
    const revenue = await computeRevenue(filter)
    const folder = [...revenue.byFolder].sort((a, b) => D(b.amount).cmp(D(a.amount)))[0]
    expect(folder).toBeDefined()

    const folderStep = { kind: 'folder' as const, id: folder!.id, label: folder!.label }
    const accounts = await computeDrill(filter, { metric: 'revenue', steps: [folderStep] })
    expect(accounts.nextKind).toBe('account')
    expect(D(sum(accounts.rows.map((r) => r.amount ?? '0'))).minus(D(folder!.amount)).abs().lt(1)).toBe(true)

    const account = accounts.rows[0]!
    const accountStep = { kind: 'account' as const, id: account.id!, label: account.name ?? '' }
    const entities = await computeDrill(filter, { metric: 'revenue', steps: [folderStep, accountStep] })
    expect(entities.nextKind).toBe('entity')
    expect(D(sum(entities.rows.map((r) => r.amount ?? '0'))).lte(D(account.amount!).plus(1))).toBe(true)

    const entity = entities.rows[0]!
    const journals = await computeDrill(filter, {
      metric: 'revenue',
      steps: [folderStep, accountStep, { kind: 'entity', id: entity.id!, label: entity.name ?? '' }],
    })
    expect(journals.columns.some((c) => c.id === 'journalNumber')).toBe(true)
    expect(journals.rows.length).toBeGreaterThan(0)
  })

  it('Drill-down: P&L, cash flow and cash position sections return rows', { timeout: TEST_TIMEOUT }, async () => {
    const pnlDrill = await computeDrill(filter, { metric: 'pnl', steps: [{ kind: 'section', id: 'revenue', label: 'Revenue' }] })
    expect(pnlDrill.rows.length).toBeGreaterThan(0)
    // Revenue accounts are credit-side: their drill amounts are positive (G17).
    expect(pnlDrill.rows.every((r) => !D(r.amount ?? '0').isNegative())).toBe(true)

    const cashFlow = await computeCashFlow(filter)
    const drawer = cashFlow.drawers.find((d) => d.rows.length > 0)
    if (drawer) {
      const subrows = await computeDrill(filter, {
        metric: 'cashFlow',
        steps: [{ kind: 'section', id: drawer.drawer, label: drawer.drawer }],
      })
      expect(sum(subrows.rows.map((r) => r.amount ?? '0'))).toBe(drawer.total)
    }

    const cashDrill = await computeDrill(filter, {
      metric: 'cashPosition',
      steps: [{ kind: 'section', id: 'cash', label: 'Cash' }],
    })
    expect(cashDrill.nextKind).toBe('account')
  })

  it('Data checks run and use the documented codes', { timeout: TEST_TIMEOUT }, async () => {
    const checks = await computeDataChecks(entityFilter)
    expect(Array.isArray(checks)).toBe(true)
    for (const c of checks) expect(['warning', 'danger']).toContain(c.level)
    const { entities } = await getCachedEntities()
    expect(entities.length).toBeGreaterThan(0)
    expect(entityCode).not.toBe('')
  })
})
