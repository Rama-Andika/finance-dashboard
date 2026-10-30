import '@tanstack/react-start/server-only'
import { memoMetric } from '~/server/cache'
import { buildDataChecks, type DataCheckItem } from '~/lib/finance/checks/data-checks'
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

export type { DataCheckItem }

/** One failed sub-check must not hide the others, but it must not pass silently either. */
export async function settle<T>(name: string, work: Promise<T>, failures: string[]): Promise<T | null> {
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
    settle('Q1b', checkQ1b(filter.locationIds), failures),
    settle('Q7', checkQ7(filter.locationIds), failures),
    settle('Q8', checkQ8(), failures),
    settle('Q9', checkQ9(filter.entitySegmentColumn, filter.segmentDetailIds, filter.asOf), failures),
    settle('unposted', checkUnpostedJournals(activePeriods), failures),
    settle('mapping', getMappingRow(), failures),
    settle('cashPosition', computeCashPosition(filter, { includeByEntity: false, includeCompare: false }), failures),
    settle('cashFlow', computeCashFlow(filter), failures),
    settle('apAging', computeApAging(filter), failures),
    settle('arAging', computeArAging(filter), failures),
  ])

  return buildDataChecks({
    cashFlow: cfResult,
    transitRegister: q9,
    cashPositionReconciliation: cpResult?.reconciliation ?? null,
    apReconciliation: apResult?.reconciliation ?? null,
    arUnallocatedReturns: arResult?.unallocatedReturns ?? null,
    paidWithoutDetail: q1b,
    cardsWithoutParty: q7Count,
    cardsWithInvalidLocation: q8Count,
    unpostedJournals: unposted,
    mappingRow: failures.includes('mapping') ? undefined : mappingRow,
    failedChecks: failures,
  })
}
