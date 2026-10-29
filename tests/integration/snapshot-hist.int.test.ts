import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { addDays } from '~/lib/format/date'
import { histOpenInvoices, histUnallocated } from '~/server/dash/snapshot-hist'
import { liveAgingInvoices, liveAgingUnallocated } from '~/server/repo/apar.repo'

/**
 * The month-end history must hold exactly what the live ERP query returns for the same day.
 * It uses the newest FINAL month-end in the history and is skipped when there is none
 * (run `npm run dash:refresh-hist` first). If someone back-dated entries into that month after it was built,
 * the numbers differ on purpose: rebuild the month and run the test again.
 */
const TIMEOUT = 900_000

async function newestFinalMonthEnd(): Promise<string | null> {
  const res = await rows<{ asOf: string }>(sql`
    SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOf
    FROM dash_snap_ap_ar_hist_dates WHERE is_final = 1 ORDER BY as_of_date DESC LIMIT 1
  `)
  return res[0] ? String(res[0].asOf) : null
}

function byId<T extends { invoiceId?: string; cardId?: string; balance: string }>(list: T[]): Map<string, string> {
  return new Map(list.map((r) => [(r.invoiceId ?? r.cardId) as string, r.balance]))
}

describe('AP/AR month-end history equals the live ERP query', () => {
  it('AR open invoices and unallocated receipts match exactly (all entities)', async () => {
    const asOf = await newestFinalMonthEnd()
    if (!asOf) return console.warn('skipped: no final month-end in the history (run npm run dash:refresh-hist)')
    const asOfPlusOne = addDays(asOf, 1)

    const [live, hist] = await Promise.all([
      liveAgingInvoices('ar', asOfPlusOne, 'all', 'customerId'),
      histOpenInvoices('ar', asOf, 'all', 'customerId'),
    ])
    expect(byId(hist)).toEqual(byId(live))

    const [liveU, histU] = await Promise.all([
      liveAgingUnallocated('ar', asOfPlusOne, 'all', 'customerId'),
      histUnallocated('ar', asOf, 'all', 'customerId'),
    ])
    expect(byId(histU)).toEqual(byId(liveU))
  }, TIMEOUT)

  it('AP open invoices and unallocated payments match for three real locations', async () => {
    const asOf = await newestFinalMonthEnd()
    if (!asOf) return console.warn('skipped: no final month-end in the history (run npm run dash:refresh-hist)')
    const asOfPlusOne = addDays(asOf, 1)

    // Three locations with a modest number of open bills (the full AP query takes minutes; the per-location one is fast)
    const locs = await rows<{ id: string }>(sql`
      SELECT CAST(location_id AS CHAR) AS id FROM dash_snap_ap_ar_hist_open
      WHERE as_of_date = ${asOf} AND module_type = 0 AND location_id IS NOT NULL
      GROUP BY location_id HAVING COUNT(*) BETWEEN 50 AND 3000 ORDER BY COUNT(*) DESC LIMIT 3
    `)
    expect(locs.length).toBeGreaterThan(0)
    const ids = locs.map((l) => String(l.id))

    const [live, hist] = await Promise.all([
      liveAgingInvoices('ap', asOfPlusOne, ids, 'vendorId'),
      histOpenInvoices('ap', asOf, ids, 'vendorId'),
    ])
    expect(hist.length).toBeGreaterThan(0)
    expect(byId(hist)).toEqual(byId(live))

    const [liveU, histU] = await Promise.all([
      liveAgingUnallocated('ap', asOfPlusOne, ids, 'vendorId'),
      histUnallocated('ap', asOf, ids, 'vendorId'),
    ])
    expect(byId(histU)).toEqual(byId(liveU))
  }, TIMEOUT)
})
