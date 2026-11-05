import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { D } from '~/lib/core/money'
import { addDays } from '~/lib/format/date'
import { computeApAging, computeArAging } from '~/lib/finance/ap-ar/apar'
import { computeApAgingFromAggregates, computeArAgingFromAggregates } from '~/lib/finance/ap-ar/aging-aggregate'
import { getCachedCoaTree, getCachedEntities } from '~/server/context'
import { apArSnapshotInfo, snapshotOpenInvoices, snapshotUnallocated } from '~/server/dash/snapshot'
import { snapshotAgingAggregates, snapshotDueTotals } from '~/server/dash/snapshot-aggregate'
import { listCustomers, listVendors } from '~/server/repo/ap-ar/party.repo'
import type { Id } from '~/lib/core/types'

/**
 * Aging summed by the database from today's snapshot must equal the aging computed from every invoice of the snapshot.
 * Needs the AP/AR snapshot (`npm run dash:refresh`). Compared at the day the snapshot describes.
 */
const TIMEOUT = 600_000

const byKey = <T>(list: T[], key: (t: T) => string): T[] => [...list].sort((a, b) => key(a).localeCompare(key(b)))
const distinct = (ids: Array<Id | null | undefined>): Id[] =>
  Array.from(new Set(ids.filter((id): id is Id => Boolean(id))))

async function scopes(): Promise<Array<Id[] | 'all'>> {
  const { entities } = await getCachedEntities()
  const first = entities.slice(0, 2).map((e) => e.locationId)
  return first.length > 0 ? ['all', first] : ['all']
}

describe("AP/AR aggregates equal the invoice list (today's snapshot)", () => {
  it(
    'payables',
    async () => {
      const info = await apArSnapshotInfo()
      if (!info) return console.warn('skipped: no AP/AR snapshot (npm run dash:refresh)')
      const tree = await getCachedCoaTree()
      for (const locIds of await scopes()) {
        const [open, unallocated, aggregates] = await Promise.all([
          snapshotOpenInvoices('ap', locIds, 'vendorId'),
          snapshotUnallocated('ap', locIds, 'vendorId'),
          snapshotAgingAggregates('ap', info.asOfDate, locIds),
        ])
        const vendors = new Map(
          (await listVendors(distinct([...open.map((o) => o.vendorId), ...unallocated.map((u) => u.vendorId)]))).map(
            (v) => [v.vendorId, { code: v.code, name: v.name }],
          ),
        )
        const old = computeApAging({
          partA: open,
          partB: unallocated,
          asOf: info.asOfDate,
          vendors,
          tree,
        })
        const fresh = computeApAgingFromAggregates({ aggregates, vendors, tree })
        const norm = (r: typeof old) => ({
          ...r,
          byVendor: byKey(r.byVendor, (v) => v.vendorId),
          controlAccounts: byKey(r.controlAccounts, (a) => a.coaId),
        })
        expect(norm(fresh)).toEqual(norm(old))
      }
    },
    TIMEOUT,
  )

  it(
    'receivables',
    async () => {
      const info = await apArSnapshotInfo()
      if (!info) return console.warn('skipped: no AP/AR snapshot (npm run dash:refresh)')
      const tree = await getCachedCoaTree()
      for (const locIds of await scopes()) {
        const [open, unallocated, aggregates] = await Promise.all([
          snapshotOpenInvoices('ar', locIds, 'customerId'),
          snapshotUnallocated('ar', locIds, 'customerId'),
          snapshotAgingAggregates('ar', info.asOfDate, locIds),
        ])
        const customers = new Map(
          (
            await listCustomers(distinct([...open.map((o) => o.customerId), ...unallocated.map((u) => u.customerId)]))
          ).map((c) => [c.customerId, { code: c.code, name: c.name }]),
        )
        const old = computeArAging({
          partA: open,
          partB: unallocated,
          asOf: info.asOfDate,
          customers,
          tree,
        })
        const fresh = computeArAgingFromAggregates({ aggregates, customers, tree })
        const norm = (r: typeof old) => ({
          ...r,
          byCustomer: byKey(r.byCustomer, (c) => c.customerId),
          controlAccounts: byKey(r.controlAccounts, (a) => a.coaId),
        })
        expect(norm(fresh)).toEqual(norm(old))
      }
    },
    TIMEOUT,
  )

  it(
    'due-date totals equal grouping the open bills above zero',
    async () => {
      const info = await apArSnapshotInfo()
      if (!info) return console.warn('skipped: no AP/AR snapshot (npm run dash:refresh)')
      const maxDue = addDays(info.asOfDate, 6)
      const open = await snapshotOpenInvoices('ap', 'all', 'vendorId')
      const expected = new Map<string, Decimal>()
      for (const o of open) {
        const due = o.dueDate || o.txDate
        if (D(o.balance).gt(0) && due <= maxDue) expected.set(due, (expected.get(due) ?? D(0)).plus(D(o.balance)))
      }
      const actual = await snapshotDueTotals('ap', 'all', { maxDue })
      expect(Object.fromEntries(actual)).toEqual(
        Object.fromEntries(Array.from(expected, ([d, t]) => [d, t.toFixed(2)])),
      )
    },
    TIMEOUT,
  )
})
