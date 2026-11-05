import { describe, expect, it } from 'vitest'
import type { PoolConnection } from 'mysql2/promise'
import { refreshPool } from '~/server/db/refresh-pool'
import { AGING_SIDES, IN_OUT_VALUES, ints } from '~/server/db/erp-codes'
import { loadSettlementSums } from '~/server/dash/refresh-ap-ar'
import { addDays } from '~/lib/format/date'
import { D } from '~/lib/core/money'

/**
 * The two plain scans of the rebuild must give the same payments per invoice as the SQL join they replaced
 * (kept here as the reference). Full tables, both sides, today and a past day; it takes a few minutes.
 */
const TIMEOUT = 1_800_000

async function referenceSums(
  conn: PoolConnection,
  side: 'ap' | 'ar',
  asOfPlusOne: string,
): Promise<Map<string, string>> {
  const cfg = AGING_SIDES[side]
  const [res] = await conn.query({
    sql: `SELECT d.invoice_id, SUM(d.amount) FROM ap_ar_card_detail d
          JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
          WHERE p.module_type = ${cfg.module} AND p.transaction_type IN (${ints(cfg.settlementTypes)})
            AND p.in_out IN (${ints(IN_OUT_VALUES)}) AND p.transaction_date < ?
          GROUP BY d.invoice_id`,
    values: [asOfPlusOne],
    rowsAsArray: true,
  })
  const out = new Map<string, string>()
  for (const r of res as unknown[][]) {
    // a NULL invoice id is one group that no invoice ever matches; a NULL sum cannot be used by openBalance either
    if (r[0] === null || r[1] === null) continue
    out.set(String(r[0]), String(r[1]))
  }
  return out
}

describe('AP/AR settlement sums equal the SQL join they replaced', () => {
  const today = process.env.APP_TODAY ?? '2025-10-15'
  const cases = [
    ...(['ap', 'ar'] as const).flatMap((side) => [
      { side, asOfPlusOne: addDays(today, 1) },
      { side, asOfPlusOne: '2025-06-01' },
    ]),
  ]
  for (const { side, asOfPlusOne } of cases) {
    it(
      `${side}, invoices settled before ${asOfPlusOne}`,
      async () => {
        const conn = await refreshPool.getConnection()
        try {
          const [expected, actual] = [
            await referenceSums(conn, side, asOfPlusOne),
            await loadSettlementSums(conn, side, asOfPlusOne),
          ]
          expect(actual.size).toBe(expected.size)
          const different: string[] = []
          for (const [id, sum] of expected) {
            const got = actual.get(id)
            if (got === undefined || !D(got).eq(D(sum))) different.push(id)
          }
          expect(different.slice(0, 20)).toEqual([])
        } finally {
          conn.release()
        }
      },
      TIMEOUT,
    )
  }
})
