import '@tanstack/react-start/server-only'
import type { Id, IsoDate, Money, ResolvedFilter, AccountGroup } from '~/lib/finance/types'
import { getCachedPeriods } from '~/server/context'
import { listCoa } from '~/server/repo/coa.repo'
import {
  openingBalances,
  countOpeningRows,
  movementsByDate,
} from '~/server/repo/gl.repo'
import { pickOpeningPeriod, combineBalances } from '~/lib/finance/balance'
import { addDays } from '~/lib/format/date'

export async function balancesAt(input: {
  asOf: IsoDate
  coaIds: Id[]
  filter: ResolvedFilter & { entitySegmentColumn: string }
}): Promise<{
  byCoa: Map<Id, Money>
  method: 'opening-table' | 'trial-balance'
}> {
  const periods = await getCachedPeriods()
  const coaRows = await listCoa()

  const accountsMap = new Map<Id, { accountGroup: AccountGroup }>()
  for (const r of coaRows) {
    if (input.coaIds.includes(r.coaId)) {
      accountsMap.set(r.coaId, { accountGroup: r.accountGroup })
    }
  }

  const { closed, opening } = pickOpeningPeriod(periods, input.asOf)

  let method: 'opening-table' | 'trial-balance' = 'trial-balance'
  let openings: Array<{ coaId: Id; opening: Money }> = []
  let movements: Array<{ coaId: Id; debet: Money; credit: Money }> = []

  // Step 2: If P* exists and has opening rows in DB
  const openingCount = opening ? await countOpeningRows(opening.periodeId) : 0

  if (opening && openingCount > 0) {
    method = 'opening-table'
    openings = await openingBalances({
      periodeId: opening.periodeId,
      segCol: input.filter.entitySegmentColumn,
      segIds: input.filter.segmentDetailIds,
      coaIds: input.coaIds,
    })

    const fromDate = closed ? addDays(closed.endDate, 1) : opening.startDate
    // Identify GL tables overlapping [fromDate, asOf]
    const activeTables = Array.from(
      new Set(
        periods
          .filter((p) => p.endDate >= fromDate && p.startDate <= input.asOf)
          .map((p) => p.tableName),
      ),
    )
    if (activeTables.length === 0) {
      activeTables.push(opening.tableName || 'gl')
    }

    movements = await movementsByDate({
      from: fromDate,
      to: input.asOf,
      tables: activeTables,
      segCol: input.filter.entitySegmentColumn,
      segIds: input.filter.segmentDetailIds,
      coaIds: input.coaIds,
    })
  } else {
    // Step 3: Fallback trial-balance
    method = 'trial-balance'
    openings = []

    const allTables = Array.from(
      new Set(
        periods
          .filter((p) => p.startDate <= input.asOf)
          .map((p) => p.tableName),
      ),
    )
    if (allTables.length === 0) {
      allTables.push('gl')
    }

    movements = await movementsByDate({
      from: '1900-01-01',
      to: input.asOf,
      tables: allTables,
      segCol: input.filter.entitySegmentColumn,
      segIds: input.filter.segmentDetailIds,
      coaIds: input.coaIds,
    })
  }

  const byCoa = combineBalances(accountsMap, openings, movements)

  return {
    byCoa,
    method,
  }
}
