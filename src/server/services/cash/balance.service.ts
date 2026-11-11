import '@tanstack/react-start/server-only'
import type { Id, IsoDate, Money, ResolvedFilter, AccountGroup } from '~/lib/core/types'
import { getCachedCoaTree, getCachedPeriods } from '~/server/context'
import {
  openingBalances,
  countOpeningRows,
  movementsByDate,
  type DateMovementRow,
  type OpeningBalanceRow,
} from '~/server/repo/gl/gl.repo'
import { pickOpeningPeriod, combineBalances } from '~/lib/finance/period/balance'
import { addDays, diffDays } from '~/lib/format/date'
import { hashIds, memo } from '~/server/cache'
import { tablesBetween } from '~/server/db/gl-tables'

type BalanceInput = {
  asOf: IsoDate
  coaIds: Id[]
  filter: ResolvedFilter & { entitySegmentColumn: string }
}

type BalanceMethod = 'opening-table' | 'trial-balance'

/** What a balance is built from: the saved opening balances (when there are any) and the movements after them. */
type BalanceInputs = { openings: OpeningBalanceRow[]; movements: DateMovementRow[]; method: BalanceMethod }

/** Loads openings + movements per data-model §4.5 (opening table, or trial-balance fallback). */
async function loadBalanceInputs(input: BalanceInput, options: { bySegment: boolean }): Promise<BalanceInputs> {
  const { bySegment } = options
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

/**
 * The longest window (days from the day after the last closed period up to `asOf`) for which one read serves every
 * account list. A longer window keeps the narrow read of just the accounts that were asked for, because an unfiltered
 * read of a long window is what the optimizer handles worst.
 */
const SHARED_READ_MAX_DAYS = 62

function sharedInputsKey(input: BalanceInput): string {
  const f = input.filter
  return ['balanceInputs', input.asOf, f.entitySegmentColumn, hashIds(f.segmentDetailIds)].join('|')
}

/**
 * The saved opening balances and the movements of ALL accounts for one date and entity filter, read once. Cash
 * Position, Cash Flow, Runway and the reconciliations ask for the same date with different account lists. The
 * movement query reads every journal line of the window anyway (it starts from the journal dates), so one unfiltered
 * read costs about the same as one narrow read, and every account list is then answered from it.
 * Answers null when the shared read does not apply: no saved opening balances (the trial-balance fallback keeps its
 * narrow read) or a window longer than SHARED_READ_MAX_DAYS.
 */
async function loadSharedBalanceInputs(input: BalanceInput): Promise<BalanceInputs | null> {
  const periods = await getCachedPeriods()
  const { closed, opening } = pickOpeningPeriod(periods, input.asOf)
  if (!opening || (await countOpeningRows(opening.periodeId)) === 0) return null
  const fromDate = closed ? addDays(closed.endDate, 1) : opening.startDate
  if (diffDays(input.asOf, fromDate) > SHARED_READ_MAX_DAYS) return null

  const segCol = input.filter.entitySegmentColumn
  const segIds = input.filter.segmentDetailIds
  return memo<BalanceInputs>(sharedInputsKey(input), BALANCE_CACHE_MS, async () => {
    const tree = await getCachedCoaTree()
    const [openings, movements] = await Promise.all([
      openingBalances({
        periodeId: opening.periodeId,
        segCol,
        segIds,
        coaIds: Array.from(tree.byId.keys()),
        bySegment: false,
      }),
      // No account list here: the window is read for every account and the caller picks the accounts it needs.
      movementsByDate({
        from: fromDate,
        to: input.asOf,
        tables: tablesBetween(periods, fromDate, input.asOf, opening.tableName || 'gl'),
        segCol,
        segIds,
        bySegment: false,
      }),
    ])
    return { openings, movements, method: 'opening-table' }
  })
}

/** The shared read when it applies, else the narrow read of the accounts that were asked for (as before). */
async function balanceInputsFor(input: BalanceInput): Promise<BalanceInputs> {
  const shared = await loadSharedBalanceInputs(input)
  if (!shared) return loadBalanceInputs(input, { bySegment: false })
  // Opening rows of other accounts must not become keys of the answer. Movements of other accounts need no filter:
  // combineBalances ignores accounts that are not in the asked list.
  const wanted = new Set(input.coaIds)
  return { ...shared, openings: shared.openings.filter((o) => wanted.has(o.coaId)) }
}

/** The returned maps are cached and shared: callers must only read them. */
export function balancesAt(input: BalanceInput): Promise<{
  byCoa: Map<Id, Money>
  method: BalanceMethod
}> {
  if (input.coaIds.length === 0) return Promise.resolve({ byCoa: new Map(), method: 'trial-balance' })
  return memo(balanceKey('balances', input), BALANCE_CACHE_MS, async () => {
    const [accounts, { openings, movements, method }] = await Promise.all([
      accountGroupsOf(input.coaIds),
      balanceInputsFor(input),
    ])
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

  const [accounts, { openings, movements, method }] = await Promise.all([
    accountGroupsOf(input.coaIds),
    loadBalanceInputs(input, { bySegment: true }),
  ])

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
    bySegment.set(seg, combineBalances(accounts, openingsBySeg.get(seg) ?? [], movementsBySeg.get(seg) ?? []))
  }
  return { bySegment, method }
}
