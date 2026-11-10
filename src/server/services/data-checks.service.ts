import '@tanstack/react-start/server-only'
import { activePeriodsOf } from '~/lib/filters/filter-scope'
import { memoMetric } from '~/server/cache'
import { createLogger } from '~/server/log'
import { buildDataChecks, type DataCheckItem } from '~/lib/finance/checks/data-checks'
import { type AppContextFilter, getCachedPeriods } from '~/server/context'
import { D } from '~/lib/core/money'
import {
  checkApPaidWithoutPayment,
  checkArPaymentsWithoutAllocation,
  checkCardsWithInvalidLocation,
  checkCardsWithoutParty,
  checkTransitOverdue,
  checkUnpostedJournals,
} from '~/server/repo/data-checks.repo'
import { getMappingRow } from '~/server/repo/settings.repo'
import { computeCashPosition } from '~/server/services/cash/cash-position.service'
import { computeCashFlow } from '~/server/services/cash/cash-flow.service'
import { computeApAging } from '~/server/services/ap-ar/ap-aging.service'
import { computeArAging } from '~/server/services/ap-ar/ar-aging.service'
import { computeBalanceSheet } from '~/server/services/balance-sheet/balance-sheet.service'

export type { DataCheckItem }

const log = createLogger()

/** One failed sub-check must not hide the others, but it must not pass silently either. */
export async function settle<T>(name: string, work: Promise<T>, failures: string[]): Promise<T | null> {
  try {
    return await work
  } catch (error) {
    log.error({ err: error, label: name }, 'data check failed')
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
  const activePeriods = activePeriodsOf(periods, filter.periodIds)

  // Run checks concurrently
  const [
    apPaidWithoutPayment,
    cardsWithoutParty,
    cardsWithInvalidLocation,
    transitOverdue,
    unposted,
    mappingRow,
    cpResult,
    cfResult,
    apResult,
    arResult,
    arPaymentsWithoutAllocation,
    balanceSheet,
  ] = await Promise.all([
    settle('apPaidWithoutPayment', checkApPaidWithoutPayment(filter.locationIds), failures),
    settle('cardsWithoutParty', checkCardsWithoutParty(filter.locationIds), failures),
    settle('cardsWithInvalidLocation', checkCardsWithInvalidLocation(), failures),
    settle(
      'transitOverdue',
      checkTransitOverdue(filter.entitySegmentColumn, filter.segmentDetailIds, filter.asOf),
      failures,
    ),
    settle('unposted', checkUnpostedJournals(activePeriods), failures),
    settle('mapping', getMappingRow(), failures),
    settle('cashPosition', computeCashPosition(filter, { includeByEntity: false, includeCompare: false }), failures),
    settle('cashFlow', computeCashFlow(filter), failures),
    settle('apAging', computeApAging(filter), failures),
    settle('arAging', computeArAging(filter), failures),
    settle('arPaymentsWithoutAllocation', checkArPaymentsWithoutAllocation(filter.locationIds, filter.today), failures),
    settle('balanceSheet', computeBalanceSheet(filter, 'none'), failures),
  ])

  return buildDataChecks({
    cashFlow: cfResult,
    transitRegister: transitOverdue,
    cashPositionReconciliation: cpResult?.reconciliation ?? null,
    apReconciliation: apResult?.reconciliation ?? null,
    arPaymentsWithoutAllocation,
    directReturnsOpen:
      apResult && arResult
        ? {
            count: apResult.directReturnCount + arResult.directReturnCount,
            amount: D(apResult.directReturns).plus(D(arResult.directReturns)).toFixed(2),
          }
        : null,
    paidWithoutDetail: apPaidWithoutPayment,
    cardsWithoutParty,
    cardsWithInvalidLocation,
    unpostedJournals: unposted,
    balanceSheet:
      balanceSheet?.status === 'ok' && balanceSheet.earnings
        ? {
            difference: balanceSheet.statement.totals.difference,
            earningsDifference: balanceSheet.earnings.difference,
            earningsAccountsMissing:
              !balanceSheet.earnings.currentAccountFound || !balanceSheet.earnings.priorAccountFound,
            fiscalMonthAssumed: balanceSheet.fiscal.assumed,
          }
        : null,
    mappingRow: failures.includes('mapping') ? undefined : mappingRow,
    failedChecks: failures,
  })
}
