import '@tanstack/react-start/server-only'
import { toInt } from '~/server/db/convert'
import { glPeriodStats } from '~/server/repo/gl/gl-period-stats.repo'
import { ASSET_GROUPS, BALANCE_SHEET_GROUPS, PNL_ACCOUNT_GROUPS } from '~/lib/finance/coa/account-groups'
import { PROFIT_GROUP_KEY } from '~/lib/finance/balance-sheet/trend'
import { periodKey, statsKey } from '~/lib/finance/period/period-fingerprint'
import type { Period } from '~/lib/core/types'
import { DASH_TABLES, dashTable } from './tables'
import { refreshClosedPeriods, type ClosedPeriodRefreshResult } from './closed-period-refresh'
import type { RefreshConnection } from './refresh-connection'

export type BalanceRefreshResult = ClosedPeriodRefreshResult

/**
 * Keeps dash_snap_balance_monthly in step with the ERP: builds every Closed period that is missing, rebuilds one whose
 * journal counts changed, and drops periods that are no longer Closed. Same rules as the GL snapshot (see
 * period-fingerprint.ts), and it reads the GL snapshot, so the GL step of the refresh cycle must run first.
 * Safe to run repeatedly; one run at a time (advisory lock).
 */
export function refreshBalanceSnapshot(): Promise<BalanceRefreshResult> {
  return refreshClosedPeriods(
    {
      label: 'balance snapshot',
      lockName: 'dash_refresh_balance',
      rowsTable: DASH_TABLES.balanceMonthly,
      markerTable: DASH_TABLES.balancePeriods,
    },
    buildPeriod,
  )
}

/**
 * The statement that writes the totals of one period. Per entity segment and group: the saved opening balances of the
 * period plus the signed movements of the period (read from the GL snapshot, so no journal is scanned), and the profit
 * (credit minus debit over every P&L account). Placeholders, in order: the target table, the period (as the value of the
 * period column), the period of the opening balances, the balance sheet groups, the asset groups (debit side), the GL
 * snapshot table, the period, the balance sheet groups, the GL snapshot table, the period, the P&L groups.
 */
export function balanceInsertStatement(periodId: string): { sql: string; params: unknown[] } {
  const sql = `INSERT INTO ?? (period_id, segment_id, group_key, amount)
       SELECT ?, x.segment_id, x.group_key, SUM(x.amount)
       FROM (
         SELECT COALESCE(o.segment1_id, 0) AS segment_id, c.account_group AS group_key, o.opening_balance AS amount
         FROM coa_opening_balance_location o
         JOIN coa c ON c.coa_id = o.coa_id
         WHERE o.periode_id = ? AND c.account_group IN (?)
         UNION ALL
         SELECT s.segment_id, c.account_group,
                CASE WHEN c.account_group IN (?) THEN s.debet - s.credit ELSE s.credit - s.debet END
         FROM ?? s
         JOIN coa c ON c.coa_id = s.coa_id
         WHERE s.period_id = ? AND c.account_group IN (?)
         UNION ALL
         SELECT s.segment_id, '${PROFIT_GROUP_KEY}', s.credit - s.debet
         FROM ?? s
         JOIN coa c ON c.coa_id = s.coa_id
         WHERE s.period_id = ? AND c.account_group IN (?)
       ) x
       GROUP BY x.segment_id, x.group_key`
  const glMonthly = dashTable(DASH_TABLES.glMonthly)
  return {
    sql,
    params: [
      dashTable(DASH_TABLES.balanceMonthly),
      periodId,
      periodId,
      [...BALANCE_SHEET_GROUPS],
      [...ASSET_GROUPS],
      glMonthly,
      periodId,
      [...BALANCE_SHEET_GROUPS],
      glMonthly,
      periodId,
      [...PNL_ACCOUNT_GROUPS],
    ],
  }
}

/**
 * One period: its rows and its marker are written in one transaction, so readers never see half a period.
 * A period whose GL snapshot is not there yet is left for the next run. A period without saved opening balances (the
 * first one, or one whose previous period was never closed) is marked as built with no rows, so it is not tried again.
 */
async function buildPeriod(conn: RefreshConnection, period: Period): Promise<void> {
  const started = Date.now()
  const rows = dashTable(DASH_TABLES.balanceMonthly)
  const marker = dashTable(DASH_TABLES.balancePeriods)

  const [glBuilt] = await conn.query('SELECT 1 AS built FROM ?? WHERE period_id = ?', [
    dashTable(DASH_TABLES.glPeriods),
    period.periodeId,
  ])
  if ((glBuilt as unknown[]).length === 0) return

  // Taken BEFORE the rows are read: a journal that changes meanwhile shows up as a difference in the next run.
  const pKey = periodKey(period)
  const sKey = statsKey(await glPeriodStats(period))

  const [openingRows] = await conn.query(
    'SELECT COUNT(*) AS n FROM coa_opening_balance_location WHERE periode_id = ?',
    [period.periodeId],
  )
  const hasOpening = toInt((openingRows as Array<{ n: number | string }>)[0]?.n) > 0

  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE period_id = ?', [rows, period.periodeId])
    let rowCount = 0
    if (hasOpening) {
      const statement = balanceInsertStatement(period.periodeId)
      const [result] = await conn.query(statement.sql, statement.params)
      rowCount = toInt((result as { affectedRows?: number }).affectedRows)
    }
    await conn.query(
      `INSERT INTO ?? (period_id, built_at, row_count, duration_ms, period_key, stats_key, checked_at)
       VALUES (?, UTC_TIMESTAMP(), ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms),
                               period_key = VALUES(period_key), stats_key = VALUES(stats_key), checked_at = VALUES(checked_at)`,
      [marker, period.periodeId, rowCount, Date.now() - started, pKey, sKey],
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}
