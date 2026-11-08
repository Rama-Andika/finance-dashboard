import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { sql, type SQL } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { SLICE_CONCURRENCY, chunk, chunkOrAll, mapLimit, sliceCombos } from '~/server/db/chunk'
import { AGING_SIDES, type AgingSide } from '~/server/db/erp-codes'
import { idOrEmpty } from '~/server/repo/ap-ar/shared'
import { D } from '~/lib/core/money'
import {
  AGING_BUCKETS,
  AGING_BUCKET_DAYS,
  NON_TRADE_ITEM_TYPE,
  RETURN_ITEM_TYPE,
  type AgingBucket,
} from '~/lib/finance/ap-ar/aging'
import { mergeAgingAggregates, type AgingAggregates, type BucketAmounts } from '~/lib/finance/ap-ar/aging-aggregate'
import type { Id, IsoDate, Money } from '~/lib/core/types'
import type { CreditPool, CreditableBill } from '~/lib/finance/ap-ar/payment-plan-credits'
import { DASH_TABLES } from './tables'
import { fullScanHint } from './scan-hint'

/**
 * Aging figures and due-date totals summed by the database from the snapshot tables, so a request never has to load
 * every open invoice. Today's snapshot has no date column; the month-end history rows carry the day they describe.
 */
export type AggregateSource = { open: string; unallocated: string; day: IsoDate | null }

export const snapshotSource: AggregateSource = {
  open: DASH_TABLES.apArOpen,
  unallocated: DASH_TABLES.apArUnallocated,
  day: null,
}

export function historySource(day: IsoDate): AggregateSource {
  return { open: DASH_TABLES.apArHistOpen, unallocated: DASH_TABLES.apArHistUnallocated, day }
}

const dayFilter = (source: AggregateSource): SQL => (source.day ? sql`AND as_of_date = ${source.day}` : sql``)
const locationSlice = (slice: Id[] | undefined): SQL => (slice ? sql`AND location_id IN (${inList(slice)})` : sql``)

/** `SUM(...)` per bucket, written from AGING_BUCKET_DAYS (the same ranges `bucketOf` uses). `a` must expose `days` and `balance`. */
function bucketSums(): SQL {
  return sql.join(
    AGING_BUCKETS.map((bucket) => {
      const { min, max } = AGING_BUCKET_DAYS[bucket]
      return sql`SUM(CASE WHEN a.days BETWEEN ${min} AND ${max} THEN a.balance ELSE 0 END) AS ${sql.identifier(bucket)}`
    }),
    sql`, `,
  )
}

/** Open invoices summed per party: the amount in each bucket, positives, negatives, non-trade and past-due bills. */
export function itemsAggregateQuery(
  source: AggregateSource,
  side: AgingSide,
  asOf: IsoDate,
  locSlice: Id[] | undefined,
): SQL {
  return sql`
    SELECT a.partyId AS partyId,
           ${bucketSums()},
           SUM(CASE WHEN a.balance > 0 THEN a.balance ELSE 0 END) AS positive,
           SUM(CASE WHEN a.balance < 0 THEN a.balance ELSE 0 END) AS negative,
           SUM(CASE WHEN a.itemType = ${NON_TRADE_ITEM_TYPE} THEN a.balance ELSE 0 END) AS nonTrade,
           SUM(CASE WHEN a.itemType = ${RETURN_ITEM_TYPE} AND a.balance < 0 THEN a.balance ELSE 0 END) AS directReturns,
           SUM(CASE WHEN a.itemType = ${RETURN_ITEM_TYPE} AND a.balance < 0 THEN 1 ELSE 0 END) AS directReturnCount,
           SUM(CASE WHEN a.balance > 0 AND a.days >= 0 THEN a.balance ELSE 0 END) AS overdueBills
    FROM (
      SELECT party_id AS partyId, balance AS balance, item_type AS itemType,
             DATEDIFF(${asOf}, COALESCE(due_date, tx_date)) AS days
      FROM ${sql.identifier(source.open)} ${fullScanHint(source.day, locSlice !== undefined)}
      WHERE module_type = ${AGING_SIDES[side].module}
        ${dayFilter(source)}
        ${locationSlice(locSlice)}
    ) a
    GROUP BY a.partyId
  `
}

/** Payments without allocation summed per party, aged by their own transaction date. */
export function paymentsAggregateQuery(
  source: AggregateSource,
  side: AgingSide,
  asOf: IsoDate,
  locSlice: Id[] | undefined,
): SQL {
  return sql`
    SELECT a.partyId AS partyId,
           ${bucketSums()},
           COUNT(*) AS paymentCount
    FROM (
      SELECT party_id AS partyId, balance AS balance, DATEDIFF(${asOf}, tx_date) AS days
      FROM ${sql.identifier(source.unallocated)}
      WHERE module_type = ${AGING_SIDES[side].module}
        AND kind = 'counted'
        ${dayFilter(source)}
        ${locationSlice(locSlice)}
    ) a
    GROUP BY a.partyId
  `
}

function coaIdsQuery(table: string, source: AggregateSource, side: AgingSide, locSlice: Id[] | undefined): SQL {
  return sql`
    SELECT DISTINCT coa_id AS coaId
    FROM ${sql.identifier(table)} ${table === source.open ? fullScanHint(source.day, locSlice !== undefined) : sql``}
    WHERE module_type = ${AGING_SIDES[side].module}
      AND coa_id IS NOT NULL
      ${table === source.unallocated ? sql`AND kind = 'counted'` : sql``}
      ${dayFilter(source)}
      ${locationSlice(locSlice)}
  `
}

type BucketColumns = Record<AgingBucket, string | number | null>
type ItemDbRow = BucketColumns & {
  partyId: string | null
  positive: string | number | null
  negative: string | number | null
  nonTrade: string | number | null
  overdueBills: string | number | null
  directReturns: string | number | null
  directReturnCount: string | number | null
}
type PaymentDbRow = BucketColumns & { partyId: string | null; paymentCount: string | number | null }

const money = (v: string | number | null | undefined): Money => D(v ?? 0).toFixed(2)

function bucketAmounts(row: BucketColumns): BucketAmounts {
  const out = {} as BucketAmounts
  for (const bucket of AGING_BUCKETS) out[bucket] = money(row[bucket])
  return out
}

async function readAggregates(
  source: AggregateSource,
  side: AgingSide,
  asOf: IsoDate,
  locIds: Id[] | 'all',
): Promise<AgingAggregates> {
  const parts = await mapLimit(chunkOrAll(locIds), SLICE_CONCURRENCY, async (locSlice): Promise<AgingAggregates> => {
    const [items, payments, itemCoas, paymentCoas] = await Promise.all([
      rows<ItemDbRow>(itemsAggregateQuery(source, side, asOf, locSlice)),
      rows<PaymentDbRow>(paymentsAggregateQuery(source, side, asOf, locSlice)),
      rows<{ coaId: string }>(coaIdsQuery(source.open, source, side, locSlice)),
      rows<{ coaId: string }>(coaIdsQuery(source.unallocated, source, side, locSlice)),
    ])
    return {
      items: items.map((r) => ({
        partyId: idOrEmpty(r.partyId),
        buckets: bucketAmounts(r),
        positive: money(r.positive),
        negative: money(r.negative),
        nonTrade: money(r.nonTrade),
        overdueBills: money(r.overdueBills),
        directReturns: money(r.directReturns),
        directReturnCount: Number(r.directReturnCount ?? 0),
      })),
      payments: payments.map((r) => ({
        partyId: idOrEmpty(r.partyId),
        buckets: bucketAmounts(r),
        count: Number(r.paymentCount ?? 0),
      })),
      coaIds: Array.from(new Set([...itemCoas, ...paymentCoas].map((r) => String(r.coaId)))),
    }
  })
  return mergeAgingAggregates(parts)
}

/** Aging figures of today's snapshot, for the request date `asOf` (call `apArSnapshotCovers(asOf)` first). */
export function snapshotAgingAggregates(
  side: AgingSide,
  asOf: IsoDate,
  locIds: Id[] | 'all',
): Promise<AgingAggregates> {
  return readAggregates(snapshotSource, side, asOf, locIds)
}

/** Aging figures of the month-end history row set `day` (call `apArHistCovers(day)` first). */
export function histAgingAggregates(side: AgingSide, day: IsoDate, locIds: Id[] | 'all'): Promise<AgingAggregates> {
  return readAggregates(historySource(day), side, day, locIds)
}

// ---------------------------------------------------------------------------------------------
// Due-date totals (Payment Plan)
// ---------------------------------------------------------------------------------------------

export type DueTotalsOptions = {
  /** Only bills due on or before this day */
  maxDue: IsoDate
  /** Only bills due on or after this day (default: no lower limit) */
  minDue?: IsoDate
  /** Only these invoices (an empty list means none) */
  invoiceIds?: Id[]
}

/** Open balances above zero summed per due date (a missing due date falls back to the transaction date). */
export function dueTotalsQuery(
  source: AggregateSource,
  side: AgingSide,
  locSlice: Id[] | undefined,
  idSlice: Id[] | undefined,
  opts: DueTotalsOptions,
): SQL {
  return sql`
    SELECT t.dueDate AS dueDate, SUM(t.balance) AS total
    FROM (
      SELECT COALESCE(due_date, tx_date) AS dueDate, balance AS balance
      FROM ${sql.identifier(source.open)} ${fullScanHint(source.day, locSlice !== undefined || idSlice !== undefined)}
      WHERE module_type = ${AGING_SIDES[side].module}
        AND balance > 0
        ${dayFilter(source)}
        ${locationSlice(locSlice)}
        ${idSlice ? sql`AND card_id IN (${inList(idSlice)})` : sql``}
    ) t
    WHERE t.dueDate <= ${opts.maxDue}
      ${opts.minDue ? sql`AND t.dueDate >= ${opts.minDue}` : sql``}
    GROUP BY t.dueDate
  `
}

async function readDueTotals(
  source: AggregateSource,
  side: AgingSide,
  locIds: Id[] | 'all',
  opts: DueTotalsOptions,
): Promise<Map<IsoDate, Money>> {
  const combos = sliceCombos(chunkOrAll(locIds), chunkOrAll(opts.invoiceIds))
  const parts = await mapLimit(combos, SLICE_CONCURRENCY, ([locSlice, idSlice]) =>
    rows<{ dueDate: string; total: string | number }>(dueTotalsQuery(source, side, locSlice, idSlice, opts)),
  )
  const totals = new Map<IsoDate, Decimal>()
  for (const r of parts.flat()) {
    const day = String(r.dueDate).slice(0, 10)
    totals.set(day, (totals.get(day) ?? D(0)).plus(D(r.total)))
  }
  return new Map(Array.from(totals, ([day, total]) => [day, total.toFixed(2)] as const))
}

/** Due-date totals of today's snapshot (call `apArSnapshotCovers` first). */
export function snapshotDueTotals(
  side: AgingSide,
  locIds: Id[] | 'all',
  opts: DueTotalsOptions,
): Promise<Map<IsoDate, Money>> {
  return readDueTotals(snapshotSource, side, locIds, opts)
}

/** Due-date totals of a month-end history day (call `apArHistCovers(day)` first). */
export function histDueTotals(
  side: AgingSide,
  day: IsoDate,
  locIds: Id[] | 'all',
  opts: DueTotalsOptions,
): Promise<Map<IsoDate, Money>> {
  return readDueTotals(historySource(day), side, locIds, opts)
}

// ---------------------------------------------------------------------------------------------
// Credits and the bills they reduce (Payment Plan)
// ---------------------------------------------------------------------------------------------

/** Open items below zero summed per (party, entity): the credits of that pair. */
export function creditPoolsQuery(source: AggregateSource, side: AgingSide, locSlice: Id[] | undefined): SQL {
  return sql`
    SELECT party_id AS partyId, location_id AS locationId, SUM(balance) AS total
    FROM ${sql.identifier(source.open)} ${fullScanHint(source.day, locSlice !== undefined)}
    WHERE module_type = ${AGING_SIDES[side].module}
      AND balance < 0
      AND party_id IS NOT NULL
      ${dayFilter(source)}
      ${locationSlice(locSlice)}
    GROUP BY party_id, location_id
  `
}

/** The unallocated table below zero summed per (party, entity): AR direct returns that are still open. */
export function unallocatedCreditPoolsQuery(source: AggregateSource, side: AgingSide, locSlice: Id[] | undefined): SQL {
  return sql`
    SELECT party_id AS partyId, location_id AS locationId, SUM(balance) AS total
    FROM ${sql.identifier(source.unallocated)}
    WHERE module_type = ${AGING_SIDES[side].module}
      AND balance < 0
      AND kind = 'counted'
      AND party_id IS NOT NULL
      ${dayFilter(source)}
      ${locationSlice(locSlice)}
    GROUP BY party_id, location_id
  `
}

/**
 * The open bills (balance above zero) due by `maxDue`. With a party list the read is narrowed to those parties and carries
 * no index hint. Without one (the vendors with a credit hold most of the bills) the read is a whole-side scan, so it uses
 * the primary-key order like the other whole-side reads (scan-hint.ts); the caller keeps the parties it needs.
 */
export function creditableBillsQuery(
  source: AggregateSource,
  side: AgingSide,
  filter: {
    /** Only bills due on or before this day */
    maxDue: IsoDate
    /** Only bills due on or after this day (default: no lower limit) */
    minDue?: IsoDate
    /** Only the bills of these parties; without it the read is a whole-side scan */
    partySlice?: Id[]
    /** Only the bills of these locations (one slice of the location list) */
    locSlice?: Id[]
  },
): SQL {
  const { maxDue, minDue, partySlice, locSlice } = filter
  return sql`
    SELECT card_id AS invoiceId, party_id AS partyId, location_id AS locationId,
           COALESCE(due_date, tx_date) AS dueDate, balance AS balance
    FROM ${sql.identifier(source.open)} ${fullScanHint(source.day, locSlice !== undefined || partySlice !== undefined)}
    WHERE module_type = ${AGING_SIDES[side].module}
      AND balance > 0
      ${partySlice ? sql`AND party_id IN (${inList(partySlice)})` : sql``}
      AND COALESCE(due_date, tx_date) <= ${maxDue}
      ${minDue ? sql`AND COALESCE(due_date, tx_date) >= ${minDue}` : sql``}
      ${dayFilter(source)}
      ${locationSlice(locSlice)}
  `
}

export type CreditDataOptions = {
  /** Only bills due on or after this day (default: no lower limit) */
  minDue?: IsoDate
  /** Also count the rows of the unallocated table (AR direct returns) in the credits */
  includeUnallocated?: boolean
}

export type CreditData = { pools: CreditPool[]; bills: CreditableBill[] }

async function readCreditData(
  source: AggregateSource,
  side: AgingSide,
  locIds: Id[] | 'all',
  maxDue: IsoDate,
  options: CreditDataOptions = {},
): Promise<CreditData> {
  const poolParts = await mapLimit(chunkOrAll(locIds), SLICE_CONCURRENCY, (locSlice) =>
    rows<{ partyId: string | null; locationId: string | null; total: string | number }>(
      creditPoolsQuery(source, side, locSlice),
    ),
  )
  const unallocatedParts = options.includeUnallocated
    ? await mapLimit(chunkOrAll(locIds), SLICE_CONCURRENCY, (locSlice) =>
        rows<{ partyId: string | null; locationId: string | null; total: string | number }>(
          unallocatedCreditPoolsQuery(source, side, locSlice),
        ),
      )
    : []

  const pools: CreditPool[] = [...poolParts.flat(), ...unallocatedParts.flat()]
    .map((r) => ({
      partyId: idOrEmpty(r.partyId),
      locationId: idOrEmpty(r.locationId),
      amount: D(r.total).negated().toFixed(2),
    }))
    .filter((p) => p.partyId !== '' && D(p.amount).gt(0))

  const partyIds = Array.from(new Set(pools.map((p) => p.partyId)))
  type BillDbRow = {
    invoiceId: string
    partyId: string | null
    locationId: string | null
    dueDate: string
    balance: string | number
  }
  let billRows: BillDbRow[]
  if (partyIds.length === 0) {
    billRows = [] // no credits: nothing to reduce, so the bills are not read at all
  } else if (locIds === 'all') {
    // No entity filter: nearly every bill belongs to a vendor with a credit, so one primary-key scan is much faster than
    // reading the bills through the party index in slices (5.6 s against 0.4 s on the demo data); the rest is dropped here.
    const wanted = new Set(partyIds)
    const all = await rows<BillDbRow>(creditableBillsQuery(source, side, { maxDue, minDue: options.minDue }))
    billRows = all.filter((r) => wanted.has(idOrEmpty(r.partyId)))
  } else {
    const combos = sliceCombos(chunkOrAll(locIds), chunk(partyIds))
    const parts = await mapLimit(combos, SLICE_CONCURRENCY, ([locSlice, partySlice]) =>
      rows<BillDbRow>(creditableBillsQuery(source, side, { maxDue, minDue: options.minDue, locSlice, partySlice })),
    )
    billRows = parts.flat()
  }
  const bills: CreditableBill[] = billRows.map((r) => ({
    invoiceId: String(r.invoiceId),
    partyId: idOrEmpty(r.partyId),
    locationId: idOrEmpty(r.locationId),
    dueDate: String(r.dueDate).slice(0, 10),
    balance: D(r.balance).toFixed(2),
  }))
  return { pools, bills }
}

/** Credits and creditable bills of today's snapshot (call `apArSnapshotCovers` first). */
export function snapshotCreditData(
  side: AgingSide,
  locIds: Id[] | 'all',
  maxDue: IsoDate,
  options?: CreditDataOptions,
): Promise<CreditData> {
  return readCreditData(snapshotSource, side, locIds, maxDue, options)
}

/** Credits and creditable bills of a month-end history day (call `apArHistCovers(day)` first). */
export function histCreditData(
  side: AgingSide,
  day: IsoDate,
  locIds: Id[] | 'all',
  maxDue: IsoDate,
  options?: CreditDataOptions,
): Promise<CreditData> {
  return readCreditData(historySource(day), side, locIds, maxDue, options)
}
