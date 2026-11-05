import { sql, type SQL } from 'drizzle-orm'

/**
 * Read the open-invoice snapshot table in primary-key order. For a read of a whole side (no location or invoice
 * filter) the optimizer otherwise picks the secondary index on (module_type, party_id), which does not hold the other
 * columns, and fetches every row through the primary key one by one: 6 to 10 times slower (docs/performance-measurement.md §11.1).
 * Never use it when a filter narrows the read; the secondary indexes are what make those fast.
 * The same hint is used to read the ERP `ap_ar_card` table when rebuilding the snapshot (docs/performance-measurement.md §14.1).
 */
export const FULL_SCAN_HINT_TEXT = 'FORCE INDEX (PRIMARY)'

export const FULL_SCAN_HINT: SQL = sql.raw(FULL_SCAN_HINT_TEXT)

/** The hint for a read of today's snapshot (`day` is null there) that no filter narrows; an empty fragment otherwise. */
export function fullScanHint(day: string | null, narrowed: boolean): SQL {
  return day === null && !narrowed ? FULL_SCAN_HINT : sql``
}
