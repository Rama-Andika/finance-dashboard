/** Every table the dashboard writes starts with this prefix; ERP tables are only ever read. */
export const DASH_PREFIX = 'dash_'

export const DASH_TABLES = {
  meta: 'dash_snap_meta',
  apArOpen: 'dash_snap_ap_ar_open',
  apArUnallocated: 'dash_snap_ap_ar_unallocated',
  glMonthly: 'dash_snap_gl_monthly',
  glPeriods: 'dash_snap_gl_periods',
} as const

export const SNAPSHOT_AP_AR = 'ap_ar'

const DASH_TABLE_RE = /^dash_[a-z0-9_]+$/

/** The only way a table name reaches a write statement: it must be a dash_ table. */
export function dashTable(name: string): string {
  if (!DASH_TABLE_RE.test(name)) throw new Error(`Refusing to write to a non-dash table: ${name}`)
  return name
}

/** Integers for an inlined `IN (...)` list (only numbers from code constants, never user input). */
export { ints } from '~/server/db/erp-codes'
