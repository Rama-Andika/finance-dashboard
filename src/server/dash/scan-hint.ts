import { sql, type SQL } from 'drizzle-orm'

/**
 * Read the open-invoice snapshot table in primary-key order. For a read of a whole side (no location or invoice
 * filter) the optimizer otherwise picks the secondary index on (module_type, party_id), which does not hold the other
 * columns, and fetches every row through the primary key one by one: 6 to 10 times slower (docs/performance-measurement.md §11.1).
 * Never use it when a filter narrows the read; the secondary indexes are what make those fast.
 */
export const FULL_SCAN_HINT: SQL = sql`FORCE INDEX (PRIMARY)`

/** The hint for a read of today's snapshot (`day` is null there) that no filter narrows; an empty fragment otherwise. */
export function fullScanHint(day: string | null, narrowed: boolean): SQL {
  return day === null && !narrowed ? FULL_SCAN_HINT : sql``
}
