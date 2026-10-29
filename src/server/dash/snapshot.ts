import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { AGING_SIDES, type AgingSide } from '~/server/db/erp-codes'
import { clearCache, memo, memoMetric } from '~/server/cache'
import type { Id, IsoDate } from '~/lib/core/types'
import type { AgingInvoice, AgingUnallocated } from '~/server/repo/apar.types'
import { env } from '~/server/env'
import type { SnapshotProblem } from '~/lib/finance/ap-ar/snapshot-state'
import { DASH_TABLES, SNAPSHOT_AP_AR } from './tables'

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
        rowCount: Number(r.rowCount) || 0,
        durationMs: Number(r.durationMs) || 0,
        error: r.error,
      }
    } catch (error) {
      // The dash_* tables are not there (migration not run yet): the live ERP queries are used instead.
      tablesMissing = true
      if (!warnedMissing) {
        warnedMissing = true
        console.warn(`dash: snapshot tables are not available (${error instanceof Error ? error.message : error}); using the slow live ERP queries. Run "npm run db:dash:migrate".`)
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

async function readOpenInvoices<K extends 'vendorId' | 'customerId'>(side: Side, partyKey: K): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingInvoice, 'partyId'> & Record<K, Id>
  const res = await rows<{
    cardId: string
    partyId: string | null
    locationId: string | null
    coaId: string | null
    txDate: string
    dueDate: string | null
    itemType: number | string
    invoiceNumber: string | null
    originalAmount: string
    balance: string
  }>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, due_date AS dueDate, item_type AS itemType,
           invoice_number AS invoiceNumber, original_amount AS originalAmount, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArOpen)}
    WHERE module_type = ${AGING_SIDES[side].module}
  `)
  return res.map(
    (r) =>
      ({
        invoiceId: String(r.cardId),
        invoiceNumber: r.invoiceNumber ?? '',
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
        itemType: Number(r.itemType) || 0,
        // DECIMAL(22,2) columns already come back as 2-decimal strings
        originalAmount: r.originalAmount,
        balance: r.balance,
      }) as Row,
  )
}

async function readUnallocated<K extends 'vendorId' | 'customerId'>(side: Side, partyKey: K): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingUnallocated, 'partyId'> & Record<K, Id>
  const res = await rows<{
    cardId: string
    partyId: string | null
    locationId: string | null
    coaId: string | null
    txDate: string
    balance: string
  }>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArUnallocated)}
    WHERE module_type = ${AGING_SIDES[side].module}
  `)
  return res.map(
    (r) =>
      ({
        cardId: String(r.cardId),
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        balance: r.balance,
      }) as Row,
  )
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
  const all = await memo(`snap:open:${side}:${partyKey}:${info?.refreshedAt ?? 'none'}`, SNAPSHOT_MEMO_TTL_MS, () => readOpenInvoices(side, partyKey))
  return byLocation(all, locIds)
}

export async function snapshotUnallocated<K extends 'vendorId' | 'customerId'>(
  side: Side,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  const info = await apArSnapshotInfo()
  const all = await memo(`snap:unalloc:${side}:${partyKey}:${info?.refreshedAt ?? 'none'}`, SNAPSHOT_MEMO_TTL_MS, () => readUnallocated(side, partyKey))
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
