/** Every table the dashboard writes starts with this prefix; ERP tables are only ever read. */
export const DASH_PREFIX = 'dash_'

/** Rows per multi-row INSERT when a snapshot is written. */
export const DASH_INSERT_BATCH_SIZE = 1000

/** Longest error text kept in `dash_snap_meta`. */
export const DASH_MAX_ERROR_LENGTH = 1000

export const DASH_TABLES = {
  meta: 'dash_snap_meta',
  apArOpen: 'dash_snap_ap_ar_open',
  apArUnallocated: 'dash_snap_ap_ar_unallocated',
  glMonthly: 'dash_snap_gl_monthly',
  glPeriods: 'dash_snap_gl_periods',
  apArHistOpen: 'dash_snap_ap_ar_hist_open',
  apArHistUnallocated: 'dash_snap_ap_ar_hist_unallocated',
  apArHistDates: 'dash_snap_ap_ar_hist_dates',
  cashLines: 'dash_snap_cash_lines',
  cashPeriods: 'dash_snap_cash_periods',
} as const

export const SNAPSHOT_AP_AR = 'ap_ar'

/** Cache key prefix of the journal counts of a period that the GL and cash-lines steps share within one refresh cycle. */
export const PERIOD_STATS_CACHE_PREFIX = 'dash:period-stats:'

/** The snapshots hold the entity segment only (segment1_id); other segment columns are always read from the ERP. */
export const SNAPSHOT_SEGMENT_COLUMN = 'segment1_id'

/** The cash-lines snapshot is built only for at most this many cash accounts (one IN list); more means live queries. */
export const CASH_LINES_MAX_ACCOUNTS = 1000

const DASH_TABLE_RE = /^dash_[a-z0-9_]+$/

/** The only way a table name reaches a write statement: it must be a dash_ table. */
export function dashTable(name: string): string {
  if (!DASH_TABLE_RE.test(name)) throw new Error(`Refusing to write to a non-dash table: ${name}`)
  return name
}

/** Integers for an inlined `IN (...)` list (only numbers from code constants, never user input). */
export { ints } from '~/server/db/erp-codes'
