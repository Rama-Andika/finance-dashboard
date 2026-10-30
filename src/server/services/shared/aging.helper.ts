import '@tanstack/react-start/server-only'
import { sum } from '~/lib/core/money'
import type { Id, IsoDate, Money } from '~/lib/core/types'
import type { AppContextFilter } from '~/server/context'
import { apArSnapshotCovers, apArSnapshotInfo } from '~/server/dash/snapshot'
import { apArHistCovers } from '~/server/dash/snapshot-hist'
import { balancesAt } from '~/server/services/balance.service'

/**
 * Whether the comparison date can be answered without a slow ERP read. A past date is answered from the
 * snapshot or the month-end history when one covers it; computing it from the ERP tables takes minutes,
 * so the comparison is left out instead of blocking the page. Without any snapshot the live read is used.
 */
export async function agingCompareIsAvailable(compareAsOf: IsoDate): Promise<boolean> {
  if (!(await apArSnapshotInfo())) return true
  return (await apArSnapshotCovers(compareAsOf)) || (await apArHistCovers(compareAsOf))
}

/** Distinct, non-empty ids out of several id lists (vendor or customer ids of the open items). */
export function distinctIds(...lists: Array<Array<Id | null | undefined>>): Id[] {
  return Array.from(new Set(lists.flat().filter((id): id is Id => Boolean(id))))
}

/** GL balance of the control accounts at the filter date (0 when the mapping has none). */
export async function controlAccountsGlTotal(filter: AppContextFilter, controlCoaIds: Id[]): Promise<Money> {
  if (controlCoaIds.length === 0) return '0.00'
  const res = await balancesAt({ asOf: filter.asOf, coaIds: controlCoaIds, filter })
  return sum(controlCoaIds.map((id) => res.byCoa.get(id) ?? '0.00'))
}
