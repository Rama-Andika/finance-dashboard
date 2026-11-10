import '@tanstack/react-start/server-only'
import type { PoolConnection } from 'mysql2/promise'
import { refreshPool } from '~/server/db/refresh-pool'
import { AGING_SIDES, AR_UNALLOCATED_RECEIPT_TYPE, IN_OUT_VALUES, type AgingSide } from '~/server/db/erp-codes'
import { openBalance } from '~/lib/finance/ap-ar/open-invoices'
import { chunk } from '~/server/db/chunk'
import { addDays } from '~/lib/format/date'
import { DASH_INSERT_BATCH_SIZE, DASH_MAX_ERROR_LENGTH, DASH_TABLES, SNAPSHOT_AP_AR, dashTable, ints } from './tables'
import { FULL_SCAN_HINT_TEXT } from './scan-hint'
import { createSettlementSums } from '~/lib/finance/ap-ar/settlement-sums'
import { dashLog } from './log'
import { prepareRefreshConnection, tryLock, unlock } from './refresh-connection'
import { createStepTimer, untimed, type StepTimer, type StepTiming } from './step-timer'
import { errorText } from '~/server/log'

export type Row = unknown[]

export const OPEN_COLUMNS = [
  'card_id',
  'module_type',
  'party_id',
  'location_id',
  'coa_id',
  'tx_date',
  'due_date',
  'item_type',
  'invoice_number',
  'original_amount',
  'balance',
]
export const UNALLOC_COLUMNS = [
  'card_id',
  'module_type',
  'party_id',
  'location_id',
  'coa_id',
  'tx_date',
  'balance',
  'kind',
]

/** Even when the ERP tables look unchanged, rebuild at least this often (edits do not change the fingerprint). */
const FORCE_REBUILD_MS = 60 * 60_000
const LOCK_NAME = 'dash_refresh_ap_ar'

const day = (v: unknown): string => {
  const s = v ? String(v).slice(0, 10) : ''
  return s && !s.startsWith('0000') ? s : '1900-01-01'
}
const idOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

async function query(conn: PoolConnection, sql: string, params: unknown[] = []): Promise<Row[]> {
  const [rows] = await conn.query({ sql, values: params, rowsAsArray: true })
  return rows as Row[]
}

/** Rows one at a time, so a scan of 2 million rows never has to sit in memory as one array. */
function streamRows(conn: PoolConnection, sql: string, params: unknown[]): AsyncIterable<Row> {
  // At runtime `conn.connection` is the callback-style connection, whose query has a stream; the promise typings hide it.
  const raw = conn.connection as unknown as { query(options: unknown): { stream(): AsyncIterable<Row> } }
  return raw.query({ sql, values: params, rowsAsArray: true }).stream()
}

/**
 * What was paid per invoice (the sum of the amounts that settlement cards allocated to it), as of `asOf`.
 * Two plain scans joined here instead of one SQL join with GROUP BY: nearly every detail row is its own invoice group,
 * so the join and the grouping took 80–95 s on 2 million cards, the two scans together about 11 s (docs/performance-measurement.md §14.3).
 * 1. the settlement cards of this side (the date filter lives on the card), 2. every detail row, keeping the ones of those cards.
 * The detail scan carries no index hint: the covering index of dashboard-indexes.sql is used when it exists, and naming it would
 * fail the whole refresh on a database that does not have it.
 */
export async function loadSettlementSums(
  conn: PoolConnection,
  side: AgingSide,
  asOfPlusOne: string,
  timer: StepTimer = untimed,
): Promise<Map<string, string>> {
  const cfg = AGING_SIDES[side]
  const inOut = ints(IN_OUT_VALUES)

  const settlementCards = new Set<string>()
  await timer.time(`${side}: settlement cards`, async () => {
    for await (const r of streamRows(
      conn,
      `SELECT p.ap_ar_card_id FROM ap_ar_card p ${FULL_SCAN_HINT_TEXT}
       WHERE p.module_type = ${cfg.module} AND p.transaction_type IN (${ints(cfg.settlementTypes)})
         AND p.in_out IN (${inOut}) AND p.transaction_date < ?`,
      [asOfPlusOne],
    )) {
      settlementCards.add(String(r[0]))
    }
  })

  const sums = createSettlementSums(settlementCards)
  await timer.time(`${side}: settlement details`, async () => {
    for await (const r of streamRows(
      conn,
      'SELECT d.invoice_id, d.ap_ar_card_id, d.amount FROM ap_ar_card_detail d',
      [],
    )) {
      sums.add(r[0], r[1], r[2])
    }
  })
  return sums.result()
}

/**
 * Open invoices of one side (AP or AR) at the end of `asOf`, built from plain scans instead of one big join:
 * 1. what was paid per invoice (given by the caller, see `loadSideRows`), 2. every invoice, streamed, keeping only those with a balance,
 * 3. the descriptive columns of the open ones by primary key.
 * (One join with grouping over 12 columns took ~10 minutes on the demo DB.)
 */
export async function loadOpenInvoices(
  conn: PoolConnection,
  side: AgingSide,
  asOfPlusOne: string,
  payments: ReadonlyMap<string, string>,
  timer: StepTimer = untimed,
): Promise<Row[]> {
  const cfg = AGING_SIDES[side]
  const inOut = ints(IN_OUT_VALUES)

  const open = new Map<string, { original: string; balance: string }>()
  await timer.time(`${side}: invoices scan`, async () => {
    for await (const r of streamRows(
      conn,
      `SELECT i.ap_ar_card_id, i.amount * i.in_out FROM ap_ar_card i ${FULL_SCAN_HINT_TEXT}
     WHERE i.module_type = ${cfg.module} AND i.transaction_type IN (${ints(cfg.invoiceTypes)})
       AND i.in_out IN (${inOut}) AND i.transaction_date < ?`,
      [asOfPlusOne],
    )) {
      const id = String(r[0])
      const m = openBalance(String(r[1]), payments.get(id))
      if (m) open.set(id, m)
    }
  })

  const out: Row[] = []
  await timer.time(`${side}: invoice details`, async () => {
    for (const ids of chunk(Array.from(open.keys()))) {
      const detail = await query(
        conn,
        `SELECT ap_ar_card_id, owner_id, location_id, coa_id, DATE(transaction_date), due_date, transaction_type,
              COALESCE(NULLIF(invoice_number, ''), transaction_number, '')
       FROM ap_ar_card WHERE ap_ar_card_id IN (?)`,
        [ids],
      )
      for (const r of detail) {
        const m = open.get(String(r[0]))
        if (!m) continue
        out.push([
          String(r[0]),
          cfg.module,
          idOrNull(r[1]),
          idOrNull(r[2]),
          idOrNull(r[3]),
          day(r[4]),
          r[5] ? day(r[5]) : null,
          Number(r[6]) || 0,
          String(r[7] ?? ''),
          m.original,
          m.balance,
        ])
      }
    }
  })
  return out
}

/**
 * Cards of the side without any detail row of their own: AP payments (full amount) and AR direct returns.
 * An AR direct return is used up when a settlement card allocates to it (its detail row names the return as
 * `invoice_id`): the balance is `-amount + allocations`, and a fully used return is left out.
 */
export async function loadUnallocated(
  conn: PoolConnection,
  side: AgingSide,
  asOfPlusOne: string,
  allocated: ReadonlyMap<string, string>,
  timer: StepTimer = untimed,
): Promise<Row[]> {
  const cfg = AGING_SIDES[side]
  const label = cfg.unallocatedAllocatedLater ? 'direct returns' : 'unallocated payments'
  const rows = await timer.time(`${side}: ${label}`, () =>
    query(
      conn,
      `SELECT p.ap_ar_card_id, p.owner_id, p.location_id, p.coa_id, DATE(p.transaction_date), p.amount * p.in_out
     FROM ap_ar_card p
     WHERE p.module_type = ${cfg.module} AND p.transaction_type IN (${ints(cfg.unallocatedTypes)})
       AND p.in_out IN (${ints(IN_OUT_VALUES)}) AND p.transaction_date < ?
       AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)`,
      [asOfPlusOne],
    ),
  )

  const out: Row[] = []
  for (const r of rows) {
    const original = String(r[5])
    let balance = original
    if (cfg.unallocatedAllocatedLater) {
      const open = openBalance(original, allocated.get(String(r[0])))
      if (!open) continue // fully used by a settlement card
      balance = open.balance
    }
    out.push([String(r[0]), cfg.module, idOrNull(r[1]), idOrNull(r[2]), idOrNull(r[3]), day(r[4]), balance, 'counted'])
  }

  if (cfg.unallocatedAllocatedLater) {
    const receipts = await timer.time(`${side}: customer payments without allocation`, () =>
      query(
        conn,
        `SELECT p.ap_ar_card_id, p.owner_id, p.location_id, p.coa_id, DATE(p.transaction_date), p.amount * p.in_out
       FROM ap_ar_card p
       WHERE p.module_type = ${cfg.module} AND p.transaction_type = ${AR_UNALLOCATED_RECEIPT_TYPE}
         AND p.in_out IN (${ints(IN_OUT_VALUES)}) AND p.amount <> 0 AND p.transaction_date < ?
         AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)`,
        [asOfPlusOne],
      ),
    )
    for (const r of receipts) {
      out.push([
        String(r[0]),
        cfg.module,
        idOrNull(r[1]),
        idOrNull(r[2]),
        idOrNull(r[3]),
        day(r[4]),
        String(r[5]),
        'ignored',
      ])
    }
  }
  return out
}

/**
 * Everything one side (AP or AR) puts into the snapshot: the open invoices and the unallocated cards.
 * The per-invoice settlement sums are read once and shared by both (they are the slow scans), then released.
 */
export async function loadSideRows(
  conn: PoolConnection,
  side: AgingSide,
  asOfPlusOne: string,
  timer: StepTimer = untimed,
): Promise<{ open: Row[]; unallocated: Row[] }> {
  const allocated = await loadSettlementSums(conn, side, asOfPlusOne, timer)
  const open = await loadOpenInvoices(conn, side, asOfPlusOne, allocated, timer)
  const unallocated = await loadUnallocated(conn, side, asOfPlusOne, allocated, timer)
  allocated.clear()
  return { open, unallocated }
}

/**
 * A cheap summary of the two ERP tables: row counts and highest ids. New cards, new allocations and deletions
 * change it; an edit of an existing row does not (the hourly forced rebuild catches those).
 */
export async function erpFingerprint(conn: PoolConnection): Promise<string> {
  const [cards] = await query(conn, 'SELECT COUNT(*), MAX(ap_ar_card_id) FROM ap_ar_card')
  const [details] = await query(conn, 'SELECT COUNT(*), MAX(ap_ar_card_detail_id) FROM ap_ar_card_detail')
  return `${cards?.[0]}:${cards?.[1]}|${details?.[0]}:${details?.[1]}`
}

/** Build the new rows in `<table>_new`, then swap it in with one atomic RENAME. Readers never see a half-built table. */
async function replaceTable(conn: PoolConnection, live: string, columns: string[], rows: Row[]): Promise<void> {
  const liveName = dashTable(live)
  const fresh = dashTable(`${live}_new`)
  const old = dashTable(`${live}_old`)

  await conn.query('DROP TABLE IF EXISTS ??', [fresh])
  await conn.query('CREATE TABLE ?? LIKE ??', [fresh, liveName])
  for (const batch of chunk(rows, DASH_INSERT_BATCH_SIZE)) {
    await conn.query('INSERT INTO ?? (??) VALUES ?', [fresh, columns, batch])
  }
  await conn.query('DROP TABLE IF EXISTS ??', [old])
  await conn.query('RENAME TABLE ?? TO ??, ?? TO ??', [liveName, old, fresh, liveName])
  await conn.query('DROP TABLE IF EXISTS ??', [old])
}

type MetaRow = { status: string; asOfDate: string | null; fingerprint: string | null; ageMs: number | null }

async function readMeta(conn: PoolConnection): Promise<MetaRow | null> {
  const [row] = await query(
    conn,
    `SELECT status, DATE_FORMAT(as_of_date, '%Y-%m-%d'), fingerprint,
            TIMESTAMPDIFF(SECOND, refreshed_at, UTC_TIMESTAMP()) * 1000
     FROM ?? WHERE name = ?`,
    [dashTable(DASH_TABLES.meta), SNAPSHOT_AP_AR],
  )
  if (!row) return null
  return {
    status: String(row[0]),
    asOfDate: row[1] ? String(row[1]) : null,
    fingerprint: row[2] ? String(row[2]) : null,
    ageMs: row[3] === null || row[3] === undefined ? null : Number(row[3]),
  }
}

async function setMeta(
  conn: PoolConnection,
  fields: {
    status: 'ok' | 'running' | 'failed'
    asOfDate?: string
    rowCount?: number
    durationMs?: number
    fingerprint?: string
    error?: string | null
  },
): Promise<void> {
  const meta = dashTable(DASH_TABLES.meta)
  const touchData = fields.status === 'ok'
  await conn.query(
    `INSERT INTO ?? (name, refreshed_at, checked_at, as_of_date, row_count, duration_ms, fingerprint, status, error)
     VALUES (?, ${touchData ? 'UTC_TIMESTAMP(), UTC_TIMESTAMP()' : 'NULL, NULL'}, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), error = VALUES(error)
       ${touchData ? ', refreshed_at = VALUES(refreshed_at), checked_at = VALUES(checked_at), as_of_date = VALUES(as_of_date), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms), fingerprint = VALUES(fingerprint)' : ''}`,
    [
      meta,
      SNAPSHOT_AP_AR,
      fields.asOfDate ?? null,
      fields.rowCount ?? 0,
      fields.durationMs ?? 0,
      fields.fingerprint ?? null,
      fields.status,
      fields.error ?? null,
    ],
  )
}

export type RefreshResult =
  | {
      ran: true
      asOfDate: string
      openRows: number
      unallocatedRows: number
      durationMs: number
      /** Where the time went: the scans per side, then writing the two tables */
      steps: StepTiming[]
    }
  | { ran: false; reason: 'locked' | 'unchanged' }

/**
 * Rebuilds the AP/AR snapshot as of `today`. One refresh at a time (advisory lock); a failed refresh leaves the
 * previous snapshot in place and records the error in dash_snap_meta. When the ERP fingerprint is unchanged
 * (and the snapshot is for today and younger than an hour) the rebuild is skipped and only the timestamp moves.
 */
export async function refreshApArSnapshot(today: string, options: { force?: boolean } = {}): Promise<RefreshResult> {
  const conn = await refreshPool.getConnection()
  const started = Date.now()
  let locked = false
  try {
    await prepareRefreshConnection(conn)
    locked = await tryLock(conn, LOCK_NAME)
    if (!locked) return { ran: false, reason: 'locked' }

    const previous = await readMeta(conn)
    const fingerprint = await erpFingerprint(conn)
    if (
      !options.force &&
      previous &&
      previous.status !== 'failed' &&
      previous.asOfDate === today &&
      previous.fingerprint === fingerprint &&
      previous.ageMs !== null &&
      previous.ageMs < FORCE_REBUILD_MS
    ) {
      // Nothing changed: keep the data, but say that it was checked just now.
      await conn.query('UPDATE ?? SET checked_at = UTC_TIMESTAMP() WHERE name = ?', [
        dashTable(DASH_TABLES.meta),
        SNAPSHOT_AP_AR,
      ])
      return { ran: false, reason: 'unchanged' }
    }

    await setMeta(conn, { status: 'running' })
    const asOfPlusOne = addDays(today, 1)

    const timer = createStepTimer()
    // concat, not push(...rows): spreading ~160k rows as arguments overflows the call stack
    let openRows: Row[] = []
    let unallocRows: Row[] = []
    for (const side of ['ap', 'ar'] as const) {
      const rows = await loadSideRows(conn, side, asOfPlusOne, timer)
      openRows = openRows.concat(rows.open)
      unallocRows = unallocRows.concat(rows.unallocated)
    }

    await timer.time('write open invoices', () => replaceTable(conn, DASH_TABLES.apArOpen, OPEN_COLUMNS, openRows))
    await timer.time('write unallocated payments', () =>
      replaceTable(conn, DASH_TABLES.apArUnallocated, UNALLOC_COLUMNS, unallocRows),
    )

    const durationMs = Date.now() - started
    await setMeta(conn, {
      status: 'ok',
      asOfDate: today,
      rowCount: openRows.length + unallocRows.length,
      durationMs,
      fingerprint,
    })
    return {
      ran: true,
      asOfDate: today,
      openRows: openRows.length,
      unallocatedRows: unallocRows.length,
      durationMs,
      steps: timer.steps,
    }
  } catch (error) {
    const message = errorText(error)
    dashLog.error({ err: error }, 'AP/AR snapshot refresh failed')
    if (locked)
      await setMeta(conn, { status: 'failed', error: message.slice(0, DASH_MAX_ERROR_LENGTH) }).catch(() => {})
    throw error
  } finally {
    if (locked) await unlock(conn, LOCK_NAME)
    conn.release()
  }
}
