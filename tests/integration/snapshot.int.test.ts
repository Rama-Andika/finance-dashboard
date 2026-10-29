import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { pool } from '~/server/db/client'
import { addDays } from '~/lib/format/date'
import { apArSnapshotInfo, snapshotOpenInvoices, snapshotUnallocated } from '~/server/dash/snapshot'
import { erpFingerprint } from '~/server/dash/refresh-ap-ar'
import { liveAgingInvoices, liveAgingUnallocated } from '~/server/repo/apar.repo'

/**
 * The snapshot must hold exactly what the live ERP query returns for the same day. This is the safety net for the
 * two implementations of the "open invoice" rule (SQL in the repo, scans in the refresh job).
 * It needs a snapshot (`npm run dash:refresh`) and is skipped when the ERP changed after it was built
 * (the numbers cannot match a moving target) or when no snapshot exists.
 */
const TIMEOUT = 900_000

async function comparable() {
  const info = await apArSnapshotInfo()
  if (!info) return { reason: 'no snapshot (run npm run dash:refresh)' as const }
  const [meta] = await rows<{ fingerprint: string | null }>(sql`SELECT fingerprint FROM dash_snap_meta WHERE name = 'ap_ar'`)
  const conn = await pool.getConnection()
  try {
    const now = await erpFingerprint(conn)
    if (meta?.fingerprint !== now) return { reason: 'the ERP changed after the snapshot was built' as const }
  } finally {
    conn.release()
  }
  return { info }
}

function byId<T extends { invoiceId?: string; cardId?: string; balance: string }>(list: T[]): Map<string, string> {
  return new Map(list.map((r) => [(r.invoiceId ?? r.cardId) as string, r.balance]))
}

describe('AP/AR snapshot equals the live ERP query', () => {
  it('AR open invoices and unallocated receipts match exactly (all entities)', async () => {
    const c = await comparable()
    if ('reason' in c) return console.warn(`skipped: ${c.reason}`)
    const asOfPlusOne = addDays(c.info.asOfDate, 1)

    const [live, snap] = await Promise.all([
      liveAgingInvoices('ar', asOfPlusOne, 'all', 'customerId'),
      snapshotOpenInvoices('ar', 'all', 'customerId'),
    ])
    expect(byId(snap)).toEqual(byId(live))

    const [liveU, snapU] = await Promise.all([
      liveAgingUnallocated('ar', asOfPlusOne, 'all', 'customerId'),
      snapshotUnallocated('ar', 'all', 'customerId'),
    ])
    expect(byId(snapU)).toEqual(byId(liveU))
  }, TIMEOUT)

  it('AP open invoices and unallocated payments match for three real locations', async () => {
    const c = await comparable()
    if ('reason' in c) return console.warn(`skipped: ${c.reason}`)
    const asOfPlusOne = addDays(c.info.asOfDate, 1)

    // Three locations with a modest number of open bills (the full AP query takes minutes; the per-location one is fast)
    const locs = await rows<{ id: string }>(sql`
      SELECT CAST(location_id AS CHAR) AS id FROM dash_snap_ap_ar_open
      WHERE module_type = 0 AND location_id IS NOT NULL
      GROUP BY location_id HAVING COUNT(*) BETWEEN 50 AND 3000 ORDER BY COUNT(*) DESC LIMIT 3
    `)
    expect(locs.length).toBeGreaterThan(0)
    const ids = locs.map((l) => String(l.id))

    const [live, snap] = await Promise.all([
      liveAgingInvoices('ap', asOfPlusOne, ids, 'vendorId'),
      snapshotOpenInvoices('ap', ids, 'vendorId'),
    ])
    expect(snap.length).toBeGreaterThan(0)
    expect(byId(snap)).toEqual(byId(live))

    const [liveU, snapU] = await Promise.all([
      liveAgingUnallocated('ap', asOfPlusOne, ids, 'vendorId'),
      snapshotUnallocated('ap', ids, 'vendorId'),
    ])
    expect(byId(snapU)).toEqual(byId(liveU))
  }, TIMEOUT)
})
