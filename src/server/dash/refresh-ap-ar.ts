import '@tanstack/react-start/server-only'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '~/server/db/client'
import { AGING_SIDES, IN_OUT_VALUES, type AgingSide } from '~/server/db/erp-codes'
import { openInvoices } from '~/lib/finance/open-invoices'
import { chunk } from '~/server/db/chunk'
import { addDays } from '~/lib/format/date'
import { DASH_TABLES, SNAPSHOT_AP_AR, dashTable, ints } from './tables'

type Row = unknown[]

const OPEN_COLUMNS = [
  'card_id', 'module_type', 'party_id', 'location_id', 'coa_id',
  'tx_date', 'due_date', 'item_type', 'invoice_number', 'original_amount', 'balance',
]
const UNALLOC_COLUMNS = ['card_id', 'module_type', 'party_id', 'location_id', 'coa_id', 'tx_date', 'balance']

const day = (v: unknown): string => {
  const s = v ? String(v).slice(0, 10) : ''
  return s && !s.startsWith('0000') ? s : '1900-01-01'
}
const idOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

async function query(conn: PoolConnection, sql: string, params: unknown[] = []): Promise<Row[]> {
  const [rows] = await conn.query({ sql, values: params, rowsAsArray: true })
  return rows as Row[]
}

/** Open invoices of one side (AP or AR) at the end of `asOf`, built from plain queries instead of one big join. */
async function loadOpenInvoices(conn: PoolConnection, side: AgingSide, asOfPlusOne: string): Promise<Row[]> {
  const cfg = AGING_SIDES[side]
  const inOut = ints(IN_OUT_VALUES)

  // 1. every invoice with its original signed amount, 2. what was paid per invoice, 3. combine in memory.
  // (One join with GROUP BY over 12 columns took ~10 minutes on the demo DB; these two scans take ~1-2 minutes each.)
  const candidates = await query(
    conn,
    `SELECT i.ap_ar_card_id, i.amount * i.in_out FROM ap_ar_card i
     WHERE i.module_type = ${cfg.module} AND i.transaction_type IN (${ints(cfg.invoiceTypes)})
       AND i.in_out IN (${inOut}) AND i.transaction_date < ?`,
    [asOfPlusOne],
  )
  const paidRows = await query(
    conn,
    `SELECT d.invoice_id, SUM(d.amount) FROM ap_ar_card_detail d
     JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
     WHERE p.module_type = ${cfg.module} AND p.transaction_type IN (${ints(cfg.settlementTypes)})
       AND p.in_out IN (${inOut}) AND p.transaction_date < ?
     GROUP BY d.invoice_id`,
    [asOfPlusOne],
  )

  const payments = new Map<string, string>(paidRows.map((r) => [String(r[0]), String(r[1])]))
  const open = openInvoices(
    candidates.map((r) => ({ id: String(r[0]), original: String(r[1]) })),
    payments,
  )
  const money = new Map(open.map((o) => [o.id, o]))

  // 4. descriptive columns, only for the open ones (by primary key)
  const out: Row[] = []
  for (const ids of chunk(open.map((o) => o.id))) {
    const detail = await query(
      conn,
      `SELECT ap_ar_card_id, owner_id, location_id, coa_id, DATE(transaction_date), due_date, transaction_type,
              COALESCE(NULLIF(invoice_number, ''), transaction_number, '')
       FROM ap_ar_card WHERE ap_ar_card_id IN (?)`,
      [ids],
    )
    for (const r of detail) {
      const m = money.get(String(r[0]))
      if (!m) continue
      out.push([
        String(r[0]), cfg.module, idOrNull(r[1]), idOrNull(r[2]), idOrNull(r[3]),
        day(r[4]), r[5] ? day(r[5]) : null, Number(r[6]) || 0, String(r[7] ?? ''), m.original, m.balance,
      ])
    }
  }
  return out
}

/** Payments / credit notes with no allocation to any invoice. */
async function loadUnallocated(conn: PoolConnection, side: AgingSide, asOfPlusOne: string): Promise<Row[]> {
  const cfg = AGING_SIDES[side]
  const rows = await query(
    conn,
    `SELECT p.ap_ar_card_id, p.owner_id, p.location_id, p.coa_id, DATE(p.transaction_date), p.amount * p.in_out
     FROM ap_ar_card p
     WHERE p.module_type = ${cfg.module} AND p.transaction_type IN (${ints(cfg.unallocatedTypes)})
       AND p.in_out IN (${ints(IN_OUT_VALUES)}) AND p.transaction_date < ?
       AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)`,
    [asOfPlusOne],
  )
  return rows.map((r) => [String(r[0]), cfg.module, idOrNull(r[1]), idOrNull(r[2]), idOrNull(r[3]), day(r[4]), String(r[5])])
}

/** Build the new rows in `<table>_new`, then swap it in with one atomic RENAME. Readers never see a half-built table. */
async function replaceTable(conn: PoolConnection, live: string, columns: string[], rows: Row[]): Promise<void> {
  const liveName = dashTable(live)
  const fresh = dashTable(`${live}_new`)
  const old = dashTable(`${live}_old`)

  await conn.query('DROP TABLE IF EXISTS ??', [fresh])
  await conn.query('CREATE TABLE ?? LIKE ??', [fresh, liveName])
  for (const batch of chunk(rows, 1000)) {
    await conn.query('INSERT INTO ?? (??) VALUES ?', [fresh, columns, batch])
  }
  await conn.query('DROP TABLE IF EXISTS ??', [old])
  await conn.query('RENAME TABLE ?? TO ??, ?? TO ??', [liveName, old, fresh, liveName])
  await conn.query('DROP TABLE IF EXISTS ??', [old])
}

async function setMeta(
  conn: PoolConnection,
  fields: { status: 'ok' | 'running' | 'failed'; asOfDate?: string; rowCount?: number; durationMs?: number; error?: string | null },
): Promise<void> {
  const meta = dashTable(DASH_TABLES.meta)
  const touchData = fields.status === 'ok'
  await conn.query(
    `INSERT INTO ?? (name, refreshed_at, as_of_date, row_count, duration_ms, status, error)
     VALUES (?, ${touchData ? 'UTC_TIMESTAMP()' : 'NULL'}, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), error = VALUES(error)
       ${touchData ? ', refreshed_at = VALUES(refreshed_at), as_of_date = VALUES(as_of_date), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms)' : ''}`,
    [meta, SNAPSHOT_AP_AR, fields.asOfDate ?? null, fields.rowCount ?? 0, fields.durationMs ?? 0, fields.status, fields.error ?? null],
  )
}

export type RefreshResult =
  | { ran: true; asOfDate: string; openRows: number; unallocatedRows: number; durationMs: number }
  | { ran: false; reason: 'locked' }

/**
 * Rebuilds the AP/AR snapshot as of `today`. One refresh at a time (advisory lock); a failed refresh leaves the
 * previous snapshot in place and records the error in dash_snap_meta.
 */
export async function refreshApArSnapshot(today: string): Promise<RefreshResult> {
  const conn = await pool.getConnection()
  const started = Date.now()
  let locked = false
  try {
    // Long scans are expected here; the per-connection limit meant for report queries does not apply.
    await conn.query('SET SESSION max_execution_time = 0').catch(() => {})
    await conn.query('SET SESSION max_statement_time = 0').catch(() => {})

    const [lockRows] = await conn.query("SELECT GET_LOCK('dash_refresh_ap_ar', 0) AS got")
    locked = Number((lockRows as Array<{ got: number }>)[0]?.got) === 1
    if (!locked) return { ran: false, reason: 'locked' }

    await setMeta(conn, { status: 'running' })
    const asOfPlusOne = addDays(today, 1)

    // concat, not push(...rows): spreading ~160k rows as arguments overflows the call stack
    let openRows: Row[] = []
    let unallocRows: Row[] = []
    for (const side of ['ap', 'ar'] as const) {
      openRows = openRows.concat(await loadOpenInvoices(conn, side, asOfPlusOne))
      unallocRows = unallocRows.concat(await loadUnallocated(conn, side, asOfPlusOne))
    }

    await replaceTable(conn, DASH_TABLES.apArOpen, OPEN_COLUMNS, openRows)
    await replaceTable(conn, DASH_TABLES.apArUnallocated, UNALLOC_COLUMNS, unallocRows)

    const durationMs = Date.now() - started
    await setMeta(conn, { status: 'ok', asOfDate: today, rowCount: openRows.length + unallocRows.length, durationMs })
    return { ran: true, asOfDate: today, openRows: openRows.length, unallocatedRows: unallocRows.length, durationMs }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('AP/AR snapshot refresh failed:', message)
    if (locked) await setMeta(conn, { status: 'failed', error: message.slice(0, 1000) }).catch(() => {})
    throw error
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK('dash_refresh_ap_ar')").catch(() => {})
    conn.release()
  }
}
