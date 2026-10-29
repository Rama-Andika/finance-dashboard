import '@tanstack/react-start/server-only'
import { D } from '~/lib/finance/money'
import { memoMetric } from '~/server/cache'
import type { Money } from '~/lib/finance/types'
import { type AppContextFilter, getCachedPeriods } from '~/server/context'
import {
  checkQ1b,
  checkQ7,
  checkQ8,
  checkQ9,
  checkUnpostedJournals,
} from '~/server/repo/data-checks.repo'
import { getMappingRow } from '~/server/repo/settings.repo'
import { computeCashPosition } from '~/server/services/cash-position.service'
import { computeCashFlow } from '~/server/services/cash-flow.service'
import { computeApAging } from '~/server/services/ap-aging.service'
import { computeArAging } from '~/server/services/ar-aging.service'

export type DataCheckItem = {
  code: string
  level: 'warning' | 'danger'
  count: number
  amount: Money | null
  link: string
}

/** One failed sub-check must not hide the others, but it must not pass silently either. */
async function settle<T>(name: string, work: Promise<T>, failures: string[]): Promise<T | null> {
  try {
    return await work
  } catch (error) {
    console.error(`Data check "${name}" failed:`, error instanceof Error ? error.message : error)
    failures.push(name)
    return null
  }
}

export function computeDataChecks(filter: AppContextFilter): Promise<DataCheckItem[]> {
  return memoMetric('dataChecks', filter, () => computeDataChecksUncached(filter), 5 * 60 * 1000)
}

async function computeDataChecksUncached(filter: AppContextFilter): Promise<DataCheckItem[]> {
  const failures: string[] = []
  const periods = await getCachedPeriods()
  const activePeriods = periods.filter((p) => filter.periodIds.includes(p.periodeId))

  // Run checks concurrently
  const [
    q1b,
    q7Count,
    q8Count,
    q9,
    unposted,
    mappingRow,
    cpResult,
    cfResult,
    apResult,
    arResult,
  ] = await Promise.all([
    checkQ1b(filter.locationIds),
    checkQ7(filter.locationIds),
    checkQ8(),
    checkQ9(filter.entitySegmentColumn, filter.segmentDetailIds, filter.asOf),
    checkUnpostedJournals(activePeriods),
    getMappingRow(),
    settle('cashPosition', computeCashPosition(filter, { includeByEntity: false, includeCompare: false }), failures),
    settle('cashFlow', computeCashFlow(filter), failures),
    settle('apAging', computeApAging(filter), failures),
    settle('arAging', computeArAging(filter), failures),
  ])

  const checks: DataCheckItem[] = []

  // 1. CF_IDENTITY (Danger - priority)
  if (cfResult && !cfResult.identityOk) {
    checks.push({
      code: 'CF_IDENTITY',
      level: 'danger',
      count: 1,
      amount: null,
      link: '/cash-flow',
    })
  }

  // 2. Q9 (In-transit overdue or future)
  if (q9.count > 0) {
    checks.push({
      code: 'Q9',
      level: 'warning',
      count: q9.count,
      amount: q9.amount,
      link: '/cash-position',
    })
  }

  // 3. CF_UNCLASSIFIED (Cash flow unclassified or fallback rules)
  if (cfResult) {
    let unclassifiedTotal = '0.00'
    for (const drawer of cfResult.drawers) {
      for (const row of drawer.rows) {
        if (row.unclassified) {
          unclassifiedTotal = D(unclassifiedTotal).plus(D(row.amount)).toFixed(2)
        }
      }
    }
    if (D(unclassifiedTotal).gt(0) || cfResult.source === 'fallback') {
      checks.push({
        code: 'CF_UNCLASSIFIED',
        level: 'warning',
        count: 1,
        amount: D(unclassifiedTotal).gt(0) ? unclassifiedTotal : null,
        link: '/cash-flow',
      })
    }
  }

  // 4. REC_TRANSIT (In-transit GL vs Register discrepancy)
  if (cpResult && !cpResult.reconciliation.inSync) {
    checks.push({
      code: 'REC_TRANSIT',
      level: 'warning',
      count: 1,
      amount: cpResult.reconciliation.diff,
      link: '/cash-position',
    })
  }

  // 5. REC_AP (AP GL control vs Subledger discrepancy)
  if (apResult && !apResult.reconciliation.inSync) {
    checks.push({
      code: 'REC_AP',
      level: 'warning',
      count: 1,
      amount: apResult.reconciliation.diff,
      link: '/payables',
    })
  }

  // 6. AR_UNALLOC (Customer unallocated returns/receipts)
  if (arResult && D(arResult.unallocatedReturns).gt(0)) {
    checks.push({
      code: 'AR_UNALLOC',
      level: 'warning',
      count: 1,
      amount: arResult.unallocatedReturns,
      link: '/receivables',
    })
  }

  // 7. Q1b (Non-trade AP marked paid without details)
  if (q1b.count > 0) {
    checks.push({
      code: 'Q1b',
      level: 'warning',
      count: q1b.count,
      amount: q1b.amount,
      link: '/payables',
    })
  }

  // 8. Q7 (Cards missing vendor/customer)
  if (q7Count > 0) {
    checks.push({
      code: 'Q7',
      level: 'warning',
      count: q7Count,
      amount: null,
      link: '/payables',
    })
  }

  // 9. Q8 (Cards with invalid location)
  if (q8Count > 0) {
    checks.push({
      code: 'Q8',
      level: 'warning',
      count: q8Count,
      amount: null,
      link: '/payables',
    })
  }

  // 10. UNPOSTED (Unposted journals in active periods)
  if (unposted > 0) {
    checks.push({
      code: 'UNPOSTED',
      level: 'warning',
      count: unposted,
      amount: null,
      link: '/summary',
    })
  }

  // 11. SETTINGS (Default / missing mapping)
  if (!mappingRow || !mappingRow.valueprop) {
    checks.push({
      code: 'SETTINGS',
      level: 'warning',
      count: 1,
      amount: null,
      link: '/settings/account-mapping',
    })
  }

  if (failures.length > 0) {
    checks.push({
      code: 'CHECK_FAILED',
      level: 'warning',
      count: failures.length,
      amount: null,
      link: '/summary',
    })
  }

  return checks
}
