import '@tanstack/react-start/server-only'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '~/server/db/client'
import { env } from '~/server/env'
import { chunk } from '~/server/db/chunk'
import { addDays } from '~/lib/format/date'
import { isFinalMonthEnd, monthEndsBefore, planHistBuilds, type HistBuilt } from '~/lib/finance/ap-ar/ap-ar-hist-plan'
import type { IsoDate } from '~/lib/core/types'
import { listPeriods } from '~/server/repo/periods.repo'
import { DASH_TABLES, dashTable } from './tables'
import { OPEN_COLUMNS, UNALLOC_COLUMNS, loadOpenInvoices, loadUnallocated, type Row } from './refresh-ap-ar'

const LOCK_NAME = 'dash_refresh_ap_ar_hist'

export type HistRefreshResult =
  | { ran: true; built: IsoDate[]; pruned: number; durationMs: number }
  | { ran: false; reason: 'locked' | 'nothing-to-do' }

type BuiltRow = { asOfDate: string; isFinal: number | string; ageHours: number | string | null }

/**
 * Keeps the month-end AP/AR history up to date: builds missing month-ends (and provisional ones that are outdated),
 * and removes month-ends that are no longer wanted. `maxBuilds` limits how many months one call builds.
 * One run at a time (advisory lock). A failed month leaves the other months untouched.
 */
export async function refreshApArHistSnapshots(today: IsoDate, options: { maxBuilds?: number } = {}): Promise<HistRefreshResult> {
  const started = Date.now()
  const conn = await pool.getConnection()
  let locked = false
  try {
    // Long scans are expected here; the per-connection limit meant for report queries does not apply.
    await conn.query('SET SESSION max_execution_time = 0').catch(() => {})
    await conn.query('SET SESSION max_statement_time = 0').catch(() => {})

    const [lockRows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [LOCK_NAME])
    locked = Number((lockRows as Array<{ got: number }>)[0]?.got) === 1
    if (!locked) return { ran: false, reason: 'locked' }

    const months = env.DASH_AP_AR_HIST_MONTHS
    const periods = await listPeriods()
    const closedMonthEnds = new Set(periods.filter((p) => p.type === 0 && p.status === 'Closed').map((p) => p.endDate))

    const [builtRows] = await conn.query(
      `SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate, is_final AS isFinal,
              TIMESTAMPDIFF(HOUR, built_at, UTC_TIMESTAMP()) AS ageHours
       FROM ??`,
      [dashTable(DASH_TABLES.apArHistDates)],
    )
    const built: HistBuilt[] = (builtRows as BuiltRow[]).map((r) => ({
      asOfDate: String(r.asOfDate),
      isFinal: Number(r.isFinal) === 1,
      ageHours: r.ageHours === null ? Number.POSITIVE_INFINITY : Number(r.ageHours),
    }))

    const plan = planHistBuilds({
      today,
      months,
      closedMonthEnds,
      built,
      maxBuilds: options.maxBuilds ?? Number.POSITIVE_INFINITY,
    })
    if (plan.build.length === 0 && plan.prune.length === 0) return { ran: false, reason: 'nothing-to-do' }

    for (const asOfDate of plan.prune) await removeMonth(conn, asOfDate)

    const wanted = monthEndsBefore(today, months)
    for (const [index, asOfDate] of plan.build.entries()) {
      const t0 = Date.now()
      const isFinal = isFinalMonthEnd(wanted.indexOf(asOfDate), asOfDate, closedMonthEnds)
      const rowCount = await buildMonth(conn, asOfDate, isFinal)
      console.log(`dash: AP/AR history ${index + 1}/${plan.build.length}: ${asOfDate} (${rowCount} rows, ${Math.round((Date.now() - t0) / 1000)}s)`)
    }

    return { ran: true, built: plan.build, pruned: plan.prune.length, durationMs: Date.now() - started }
  } finally {
    if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {})
    conn.release()
  }
}

/** Removes one month-end from the three history tables (one transaction). */
async function removeMonth(conn: PoolConnection, asOfDate: IsoDate): Promise<void> {
  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [dashTable(DASH_TABLES.apArHistOpen), asOfDate])
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [dashTable(DASH_TABLES.apArHistUnallocated), asOfDate])
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [dashTable(DASH_TABLES.apArHistDates), asOfDate])
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}

/**
 * Builds one month-end. The rows are read first (long, no transaction); then the rows and the "built" marker are
 * written in one transaction, so readers never see half a month. Returns the number of rows written.
 */
async function buildMonth(conn: PoolConnection, asOfDate: IsoDate, isFinal: boolean): Promise<number> {
  const started = Date.now()
  const asOfPlusOne = addDays(asOfDate, 1)

  // concat, not push(...rows): spreading ~160k rows as arguments overflows the call stack
  let openRows: Row[] = []
  let unallocRows: Row[] = []
  for (const side of ['ap', 'ar'] as const) {
    openRows = openRows.concat(await loadOpenInvoices(conn, side, asOfPlusOne))
    unallocRows = unallocRows.concat(await loadUnallocated(conn, side, asOfPlusOne))
  }
  const withDate = (list: Row[]): Row[] => list.map((r) => [asOfDate, ...r])

  const open = dashTable(DASH_TABLES.apArHistOpen)
  const unallocated = dashTable(DASH_TABLES.apArHistUnallocated)
  const dates = dashTable(DASH_TABLES.apArHistDates)
  const rowCount = openRows.length + unallocRows.length

  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [open, asOfDate])
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [unallocated, asOfDate])
    for (const batch of chunk(withDate(openRows), 1000)) {
      await conn.query('INSERT INTO ?? (??) VALUES ?', [open, ['as_of_date', ...OPEN_COLUMNS], batch])
    }
    for (const batch of chunk(withDate(unallocRows), 1000)) {
      await conn.query('INSERT INTO ?? (??) VALUES ?', [unallocated, ['as_of_date', ...UNALLOC_COLUMNS], batch])
    }
    await conn.query(
      `INSERT INTO ?? (as_of_date, built_at, row_count, duration_ms, is_final) VALUES (?, UTC_TIMESTAMP(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms), is_final = VALUES(is_final)`,
      [dates, asOfDate, rowCount, Date.now() - started, isFinal ? 1 : 0],
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
  return rowCount
}
