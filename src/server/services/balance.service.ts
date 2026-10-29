import '@tanstack/react-start/server-only'
import type { Id, IsoDate, Money, ResolvedFilter, AccountGroup, Period } from '~/lib/finance/types'
import { getCachedCoaTree, getCachedPeriods } from '~/server/context'
import {
  openingBalances,
  countOpeningRows,
  movementsByDate,
  type DateMovementRow,
  type OpeningBalanceRow,
} from '~/server/repo/gl.repo'
import { pickOpeningPeriod, combineBalances } from '~/lib/finance/balance'
import { addDays } from '~/lib/format/date'
import { hashIds, memo } from '~/server/cache'
import { tablesBetween } from '~/server/db/gl-tables'

type BalanceInput = {
  asOf: IsoDate
  coaIds: Id[]
  filter: ResolvedFilter & { entitySegmentColumn: string }
}

type BalanceMethod = 'opening-table' | 'trial-balance'


/** Loads openings + movements per data-model §4.5 (opening table, or trial-balance fallback). */
async function loadBalanceInputs(
  input: BalanceInput,
  bySegment: boolean,
): Promise<{ openings: OpeningBalanceRow[]; movements: DateMovementRow[]; method: BalanceMethod }> {
  const periods = await getCachedPeriods()
  const { closed, opening } = pickOpeningPeriod(periods, input.asOf)
  const segCol = input.filter.entitySegmentColumn
  const segIds = input.filter.segmentDetailIds

  const openingCount = opening ? await countOpeningRows(opening.periodeId) : 0

  if (opening && openingCount > 0) {
    const fromDate = closed ? addDays(closed.endDate, 1) : opening.startDate
    const [openings, movements] = await Promise.all([
      openingBalances({ periodeId: opening.periodeId, segCol, segIds, coaIds: input.coaIds, bySegment }),
      movementsByDate({
        from: fromDate,
        to: input.asOf,
        tables: tablesBetween(periods, fromDate, input.asOf, opening.tableName || 'gl'),
        segCol,
        segIds,
        coaIds: input.coaIds,
        bySegment,
      }),
    ])
    return { openings, movements, method: 'opening-table' }
  }

  // Trial-balance fallback (D29): all posted movements up to asOf, no opening rows.
  const movements = await movementsByDate({
    from: '1900-01-01',
    to: input.asOf,
    tables: tablesBetween(periods, '1900-01-01', input.asOf, 'gl'),
    segCol,
    segIds,
    coaIds: input.coaIds,
    bySegment,
  })
  return { openings: [], movements, method: 'trial-balance' }
}

async function accountGroupsOf(coaIds: Id[]): Promise<Map<Id, { accountGroup: AccountGroup }>> {
  const tree = await getCachedCoaTree()
  const accounts = new Map<Id, { accountGroup: AccountGroup }>()
  for (const id of coaIds) {
    const node = tree.byId.get(id)
    if (node) accounts.set(id, { accountGroup: node.accountGroup })
  }
  return accounts
}

/** Balances are shared within a minute: Cash Position, Runway, Cash Flow, AP/AR reconciliation and the drill-downs repeat them. */
const BALANCE_CACHE_MS = 60 * 1000

function balanceKey(kind: string, input: BalanceInput): string {
  const f = input.filter
  return [kind, input.asOf, f.entitySegmentColumn, hashIds(f.segmentDetailIds), hashIds(input.coaIds)].join('|')
}

/** The returned maps are cached and shared: callers must only read them. */
export function balancesAt(input: BalanceInput): Promise<{
  byCoa: Map<Id, Money>
  method: BalanceMethod
}> {
  if (input.coaIds.length === 0) return Promise.resolve({ byCoa: new Map(), method: 'trial-balance' })
  return memo(balanceKey('balances', input), BALANCE_CACHE_MS, async () => {
    const accounts = await accountGroupsOf(input.coaIds)
    const { openings, movements, method } = await loadBalanceInputs(input, false)
    return { byCoa: combineBalances(accounts, openings, movements), method }
  })
}

/**
 * Same balances as `balancesAt`, split per segment detail (entity) in ONE pass,
 * instead of running `balancesAt` once per entity.
 */
export function balancesBySegmentAt(input: BalanceInput): Promise<{
  bySegment: Map<Id, Map<Id, Money>>
  method: BalanceMethod
}> {
  if (input.coaIds.length === 0) return Promise.resolve({ bySegment: new Map(), method: 'trial-balance' })
  return memo(balanceKey('balancesBySegment', input), BALANCE_CACHE_MS, () => computeBalancesBySegment(input))
}

async function computeBalancesBySegment(input: BalanceInput): Promise<{
  bySegment: Map<Id, Map<Id, Money>>
  method: BalanceMethod
}> {
  const bySegment = new Map<Id, Map<Id, Money>>()

  const accounts = await accountGroupsOf(input.coaIds)
  const { openings, movements, method } = await loadBalanceInputs(input, true)

  const openingsBySeg = new Map<Id, OpeningBalanceRow[]>()
  for (const o of openings) {
    const key = o.segmentDetailId ?? ''
    const list = openingsBySeg.get(key) ?? []
    list.push(o)
    openingsBySeg.set(key, list)
  }
  const movementsBySeg = new Map<Id, DateMovementRow[]>()
  for (const m of movements) {
    const key = m.segmentDetailId ?? ''
    const list = movementsBySeg.get(key) ?? []
    list.push(m)
    movementsBySeg.set(key, list)
  }

  const segKeys = new Set([...openingsBySeg.keys(), ...movementsBySeg.keys()])
  for (const seg of segKeys) {
    bySegment.set(
      seg,
      combineBalances(accounts, openingsBySeg.get(seg) ?? [], movementsBySeg.get(seg) ?? []),
    )
  }
  return { bySegment, method }
}
