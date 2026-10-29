import { datetime, decimal, index, int, mysqlTable, primaryKey, text, tinyint, varchar, date } from 'drizzle-orm/mysql-core'
import { bigint } from '../db/bigint-string'

/**
 * Tables owned by the dashboard (every name starts with `dash_`). They hold data derived from the ERP and
 * can always be rebuilt by a refresh. The ERP tables are never written; see `src/server/dash/guard.test.ts`.
 * This file is the source for `drizzle.dash.config.ts`; the ERP mirror in `../db/schema.ts` is separate.
 */

/** One row per snapshot: when it was last built, for which date, and whether it worked. */
export const dashSnapMeta = mysqlTable('dash_snap_meta', {
  name: varchar('name', { length: 64 }).notNull().primaryKey(),
  /** When the rows were last REBUILT (cache keys follow this) */
  refreshedAt: datetime('refreshed_at', { mode: 'string' }),
  /** When the snapshot was last verified: a rebuild, or a check that found the ERP unchanged */
  checkedAt: datetime('checked_at', { mode: 'string' }),
  /** The "as of" day the snapshot describes (YYYY-MM-DD) */
  asOfDate: date('as_of_date', { mode: 'string' }),
  rowCount: int('row_count').default(0),
  durationMs: int('duration_ms').default(0),
  /** Cheap summary of the ERP tables at refresh time; an unchanged fingerprint lets the next refresh be skipped */
  fingerprint: varchar('fingerprint', { length: 191 }),
  /** ok | running | failed */
  status: varchar('status', { length: 16 }).notNull().default('ok'),
  error: text('error'),
})

/** Open AP (module 0) and AR (module 1) invoices with their remaining balance. */
export const dashSnapApArOpen = mysqlTable(
  'dash_snap_ap_ar_open',
  {
    cardId: bigint('card_id', { mode: 'string' }).notNull().primaryKey(),
    moduleType: tinyint('module_type').notNull(),
    partyId: bigint('party_id', { mode: 'string' }),
    locationId: bigint('location_id', { mode: 'string' }),
    coaId: bigint('coa_id', { mode: 'string' }),
    txDate: date('tx_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    itemType: int('item_type').notNull().default(0),
    invoiceNumber: varchar('invoice_number', { length: 120 }).notNull().default(''),
    originalAmount: decimal('original_amount', { precision: 22, scale: 2 }).notNull().default('0.00'),
    balance: decimal('balance', { precision: 22, scale: 2 }).notNull().default('0.00'),
  },
  (t) => [
    index('idx_dash_open_mod_loc_due').on(t.moduleType, t.locationId, t.dueDate),
    index('idx_dash_open_mod_party').on(t.moduleType, t.partyId),
  ],
)

/** Payments / credit notes that are not allocated to any invoice. */
export const dashSnapApArUnallocated = mysqlTable(
  'dash_snap_ap_ar_unallocated',
  {
    cardId: bigint('card_id', { mode: 'string' }).notNull().primaryKey(),
    moduleType: tinyint('module_type').notNull(),
    partyId: bigint('party_id', { mode: 'string' }),
    locationId: bigint('location_id', { mode: 'string' }),
    coaId: bigint('coa_id', { mode: 'string' }),
    txDate: date('tx_date', { mode: 'string' }).notNull(),
    balance: decimal('balance', { precision: 22, scale: 2 }).notNull().default('0.00'),
  },
  (t) => [index('idx_dash_unalloc_mod_loc').on(t.moduleType, t.locationId)],
)


/**
 * GL movements of CLOSED periods, summed per (period, account, entity segment). A closed period no longer changes,
 * so it is built once. `segment_id` is `segment1_id` (the entity segment); 0 stands for "no segment".
 */
export const dashSnapGlMonthly = mysqlTable(
  'dash_snap_gl_monthly',
  {
    periodId: bigint('period_id', { mode: 'string' }).notNull(),
    coaId: bigint('coa_id', { mode: 'string' }).notNull(),
    segmentId: bigint('segment_id', { mode: 'string' }).notNull().default('0'),
    debet: decimal('debet', { precision: 22, scale: 2 }).notNull().default('0.00'),
    credit: decimal('credit', { precision: 22, scale: 2 }).notNull().default('0.00'),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.coaId, t.segmentId] })],
)

/** Which closed periods are present in dash_snap_gl_monthly (a period is added in one transaction with its rows). */
export const dashSnapGlPeriods = mysqlTable('dash_snap_gl_periods', {
  periodId: bigint('period_id', { mode: 'string' }).notNull().primaryKey(),
  builtAt: datetime('built_at', { mode: 'string' }),
  rowCount: int('row_count').default(0),
  durationMs: int('duration_ms').default(0),
})
