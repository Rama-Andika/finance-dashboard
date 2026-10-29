import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunkOrAll } from '~/server/db/chunk'
import { AGING_SIDES, type AgingSide } from '~/server/db/erp-codes'
import { D } from '~/lib/finance/money'
import { memo } from '~/server/cache'
import type { Id, IsoDate } from '~/lib/finance/types'
import type { AgingInvoice, AgingUnallocated } from '~/server/repo/apar.repo'
import { SNAPSHOT_AP_AR } from './tables'

export type SnapshotInfo = {
  /** The day the numbers describe */
  asOfDate: IsoDate
  /** When the refresh finished (ISO, UTC) */
  refreshedAt: string
  /** Status of the latest refresh attempt: ok | running | failed (older numbers stay in use meanwhile) */
  status: 'ok' | 'running' | 'failed'
  rowCount: number
  durationMs: number
  error: string | null
}

const INFO_TTL_MS = 15_000

/** Latest successful AP/AR snapshot, or null when there is none (tables missing, or never refreshed). */
export async function apArSnapshotInfo(): Promise<SnapshotInfo | null> {
  return memo('dash:ap-ar:info', INFO_TTL_MS, async () => {
    try {
      const res = await rows<{
        asOfDate: string | null
        refreshedAt: string | null
        status: string
        rowCount: number | string | null
        durationMs: number | string | null
        error: string | null
      }>(sql`
        SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate,
               DATE_FORMAT(refreshed_at, '%Y-%m-%dT%H:%i:%sZ') AS refreshedAt,
               status AS status, row_count AS rowCount, duration_ms AS durationMs, error AS error
        FROM dash_snap_meta WHERE name = ${SNAPSHOT_AP_AR} LIMIT 1
      `)
      const r = res[0]
      if (!r || !r.asOfDate || !r.refreshedAt) return null
      return {
        asOfDate: r.asOfDate,
        refreshedAt: r.refreshedAt,
        status: (['ok', 'running', 'failed'].includes(r.status) ? r.status : 'ok') as SnapshotInfo['status'],
        rowCount: Number(r.rowCount) || 0,
        durationMs: Number(r.durationMs) || 0,
        error: r.error,
      }
    } catch {
      // The dash_* tables are not there (migration not run yet): the live ERP queries are used instead.
      return null
    }
  })
}

/**
 * True when a request for the AP/AR state at `asOf` can be answered from the snapshot: there is one, and the
 * request is for the current state (not for a date before the snapshot, which it cannot reproduce).
 */
export async function apArSnapshotCovers(asOf: IsoDate): Promise<boolean> {
  const info = await apArSnapshotInfo()
  return info !== null && asOf >= info.asOfDate
}

const NOT_ZERO = sql`1 = 1`

function locationClause(locIds: Id[] | 'all', slice: string[] | undefined) {
  return locIds === 'all' || !slice ? NOT_ZERO : sql`location_id IN (${inList(slice)})`
}

export async function snapshotOpenInvoices<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingInvoice, 'partyId'> & Record<K, Id>
  if (locIds !== 'all' && locIds.length === 0) return []
  const out: Row[] = []
  for (const slice of chunkOrAll(locIds)) {
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
      FROM dash_snap_ap_ar_open
      WHERE module_type = ${AGING_SIDES[side].module} AND ${locationClause(locIds, slice)}
    `)
    for (const r of res) {
      out.push({
        invoiceId: String(r.cardId),
        invoiceNumber: r.invoiceNumber ?? '',
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
        itemType: Number(r.itemType) || 0,
        originalAmount: D(r.originalAmount || 0).toFixed(2),
        balance: D(r.balance || 0).toFixed(2),
      } as Row)
    }
  }
  return out
}

export async function snapshotUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingUnallocated, 'partyId'> & Record<K, Id>
  if (locIds !== 'all' && locIds.length === 0) return []
  const out: Row[] = []
  for (const slice of chunkOrAll(locIds)) {
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
      FROM dash_snap_ap_ar_unallocated
      WHERE module_type = ${AGING_SIDES[side].module} AND ${locationClause(locIds, slice)}
    `)
    for (const r of res) {
      out.push({
        cardId: String(r.cardId),
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        balance: D(r.balance || 0).toFixed(2),
      } as Row)
    }
  }
  return out
}
