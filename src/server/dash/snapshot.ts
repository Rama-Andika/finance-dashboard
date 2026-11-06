import '@tanstack/react-start/server-only'
import { toInt } from '~/server/db/convert'
import {
  toAgingInvoice,
  toAgingUnallocated,
  type AgingInvoiceDbRow,
  type AgingUnallocatedDbRow,
} from '~/server/repo/ap-ar/rows'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { AGING_SIDES, MODULE_TYPE, type AgingSide } from '~/server/db/erp-codes'
import { clearCache, memo, memoMetric } from '~/server/cache'
import type { Id, IsoDate, Money } from '~/lib/core/types'
import { inList } from '~/server/db/in-list'
import { D } from '~/lib/core/money'
import { SLICE_CONCURRENCY, chunkOrAll, mapLimit } from '~/server/db/chunk'
import type { AgingInvoice, AgingUnallocated } from '~/server/repo/ap-ar/types'
import { env } from '~/server/env'
import type { SnapshotProblem } from '~/lib/finance/ap-ar/snapshot-state'
import { DASH_TABLES, SNAPSHOT_AP_AR } from './tables'
import { FULL_SCAN_HINT } from '~/server/dash/scan-hint'
import { dashLog } from './log'
import { errorText } from '~/server/log'

export type SnapshotInfo = {
  /** The day the numbers describe */
  asOfDate: IsoDate
  /** When the rows were last rebuilt (ISO, UTC); cached derived results are keyed by this */
  refreshedAt: string
  /** When the snapshot was last verified against the ERP (a rebuild, or a check that found nothing changed) */
  checkedAt: string
  /** Status of the latest refresh attempt: ok | running | failed (older numbers stay in use meanwhile) */
  status: 'ok' | 'running' | 'failed'
  rowCount: number
  durationMs: number
  error: string | null
}

const INFO_TTL_MS = 15_000

let tablesMissing = false
let warnedMissing = false

/** Latest successful AP/AR snapshot, or null when there is none (tables missing, or never refreshed). */
export async function apArSnapshotInfo(): Promise<SnapshotInfo | null> {
  return memo('dash:ap-ar:info', INFO_TTL_MS, async () => {
    try {
      const res = await rows<{
        asOfDate: string | null
        refreshedAt: string | null
        checkedAt: string | null
        status: string
        rowCount: number | string | null
        durationMs: number | string | null
        error: string | null
      }>(sql`
        SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate,
               DATE_FORMAT(refreshed_at, '%Y-%m-%dT%H:%i:%sZ') AS refreshedAt,
               DATE_FORMAT(COALESCE(checked_at, refreshed_at), '%Y-%m-%dT%H:%i:%sZ') AS checkedAt,
               status AS status, row_count AS rowCount, duration_ms AS durationMs, error AS error
        FROM ${sql.identifier(DASH_TABLES.meta)} WHERE name = ${SNAPSHOT_AP_AR} LIMIT 1
      `)
      const r = res[0]
      tablesMissing = false
      if (!r || !r.asOfDate || !r.refreshedAt) return null
      return {
        asOfDate: r.asOfDate,
        refreshedAt: r.refreshedAt,
        checkedAt: r.checkedAt ?? r.refreshedAt,
        status: (['ok', 'running', 'failed'].includes(r.status) ? r.status : 'ok') as SnapshotInfo['status'],
        rowCount: toInt(r.rowCount),
        durationMs: toInt(r.durationMs),
        error: r.error,
      }
    } catch (error) {
      // The dash_* tables are not there (migration not run yet): the live ERP queries are used instead.
      tablesMissing = true
      if (!warnedMissing) {
        warnedMissing = true
        dashLog.warn(
          `snapshot tables are not available (${errorText(error)}); using the slow live ERP queries. Run "npm run db:dash:migrate".`,
        )
      }
      return null
    }
  })
}

/** Why there is no usable snapshot (null when there is one). */
export async function apArSnapshotProblem(): Promise<SnapshotProblem | null> {
  if ((await apArSnapshotInfo()) !== null) return null
  if (tablesMissing) return 'not-migrated'
  return env.DASH_REFRESH_ENABLED === '0' ? 'disabled' : 'not-refreshed'
}

/**
 * True when a request for the AP/AR state at `asOf` can be answered from the snapshot: there is one, and the
 * request is for the current state (not for a date before the snapshot, which it cannot reproduce).
 */
export async function apArSnapshotCovers(asOf: IsoDate): Promise<boolean> {
  const info = await apArSnapshotInfo()
  return info !== null && asOf >= info.asOfDate
}

/** One snapshot generation stays in memory until the next refresh replaces it (the key carries `refreshedAt`). */
const SNAPSHOT_MEMO_TTL_MS = 6 * 60 * 60 * 1000

type Side = AgingSide

async function readOpenInvoices<K extends 'vendorId' | 'customerId'>(
  side: Side,
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  const res = await rows<AgingInvoiceDbRow>(sql`
    SELECT card_id AS invoiceId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, due_date AS dueDate, item_type AS itemType,
           invoice_number AS invoiceNumber, original_amount AS originalAmount, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArOpen)} ${FULL_SCAN_HINT}
    WHERE module_type = ${AGING_SIDES[side].module}
  `)
  return res.map((r) => toAgingInvoice(r, partyKey))
}

async function readUnallocated<K extends 'vendorId' | 'customerId'>(
  side: Side,
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  const res = await rows<AgingUnallocatedDbRow>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArUnallocated)}
    WHERE module_type = ${AGING_SIDES[side].module}
      AND kind = 'counted'
  `)
  return res.map((r) => toAgingUnallocated(r, partyKey))
}

/** Keep the rows of the selected locations. The whole side is read once per snapshot, so a different entity filter costs no query. */
export function byLocation<T extends { locationId: Id }>(all: readonly T[], locIds: Id[] | 'all'): T[] {
  if (locIds === 'all') return all as T[]
  const wanted = new Set(locIds)
  return all.filter((r) => wanted.has(r.locationId))
}

export async function snapshotOpenInvoices<K extends 'vendorId' | 'customerId'>(
  side: Side,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  const info = await apArSnapshotInfo()
  const all = await memo(`snap:open:${side}:${partyKey}:${info?.refreshedAt ?? 'none'}`, SNAPSHOT_MEMO_TTL_MS, () =>
    readOpenInvoices(side, partyKey),
  )
  return byLocation(all, locIds)
}

export async function snapshotUnallocated<K extends 'vendorId' | 'customerId'>(
  side: Side,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  const info = await apArSnapshotInfo()
  const all = await memo(`snap:unalloc:${side}:${partyKey}:${info?.refreshedAt ?? 'none'}`, SNAPSHOT_MEMO_TTL_MS, () =>
    readUnallocated(side, partyKey),
  )
  return byLocation(all, locIds)
}

/**
 * Like `memoMetric`, but a result derived from the snapshot lives as long as that snapshot (the key carries its
 * refresh time), so it is rebuilt after a refresh, not after an arbitrary 60 seconds. Without a snapshot it
 * falls back to the short metric TTL.
 */
export async function memoBySnapshot<T>(name: string, params: unknown, loader: () => Promise<T>): Promise<T> {
  const info = await apArSnapshotInfo()
  if (!info) return memoMetric(name, { params, snapshot: null }, loader)
  return memoMetric(name, { params, snapshot: info.refreshedAt }, loader, SNAPSHOT_MEMO_TTL_MS)
}

/**
 * Called right after a refresh: forget the cached "latest snapshot" answer and read the new snapshot into memory now,
 * so the first request after a refresh does not pay for reading ~160k rows (about 5 seconds on the demo data).
 */
export async function warmApArSnapshot(): Promise<void> {
  clearCache('dash:ap-ar:info')
  if (!(await apArSnapshotInfo())) return
  await Promise.all([
    snapshotOpenInvoices('ap', 'all', 'vendorId'),
    snapshotUnallocated('ap', 'all', 'vendorId'),
    snapshotOpenInvoices('ar', 'all', 'customerId'),
    snapshotUnallocated('ar', 'all', 'customerId'),
  ])
}

/** Customer payments without allocation (kind 'ignored') of today's snapshot, for the data check AR_PAYMENT_UNALLOC. */
export async function snapshotIgnoredReceipts(locIds: Id[] | 'all'): Promise<{ count: number; amount: Money }> {
  if (locIds !== 'all' && locIds.length === 0) return { count: 0, amount: '0.00' }
  const parts = await mapLimit(chunkOrAll(locIds), SLICE_CONCURRENCY, async (locSlice) => {
    const res = await rows<{ n: number | string; total: number | string | null }>(sql`
      SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS total
      FROM ${sql.identifier(DASH_TABLES.apArUnallocated)}
      WHERE module_type = ${MODULE_TYPE.AR} AND kind = 'ignored'
        ${locSlice ? sql`AND location_id IN (${inList(locSlice)})` : sql``}
    `)
    return { count: toInt(res[0]?.n), amount: D(res[0]?.total ?? 0) }
  })
  let totalCount = 0
  let totalAmount = D(0)
  for (const p of parts) {
    totalCount += p.count
    totalAmount = totalAmount.plus(p.amount)
  }
  return { count: totalCount, amount: totalAmount.toFixed(2) }
}
