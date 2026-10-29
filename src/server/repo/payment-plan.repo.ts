import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk } from '~/server/db/chunk'
import { ACTIVE_VOUCHER_STATUSES } from '~/lib/finance/ap-ar/aging'
import { memo } from '~/server/cache'
import type { Id } from '~/lib/core/types'

const PLAN_STATUS_CACHE_MS = 5 * 60 * 1000

export type PlanStatusRow = {
  invoiceId: Id
  status: string
}

/** Payment vouchers (type 0) of the given invoices; for the one page of bills a drill-down shows. */
export async function listPlanStatuses(invoiceIds: Id[]): Promise<PlanStatusRow[]> {
  const parts = await Promise.all(
    chunk(invoiceIds).map((slice) =>
      rows<{ invoiceId: string; status: string | null }>(sql`
        SELECT bd.invoice_id AS invoiceId, b.status AS status
        FROM bankpo_payment_detail bd
        JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
        WHERE b.type = 0
          AND bd.invoice_id IN (${inList(slice)})
      `),
    ),
  )
  return parts.flat().map((r) => ({ invoiceId: String(r.invoiceId), status: r.status || '' }))
}

/**
 * Every invoice that has a live payment voucher (Posted / Partialy Paid / Not Posted), in ONE query.
 * An invoice without a live voucher is "not submitted", so the payment plan never asks per invoice.
 */
export function listActivePlanStatuses(): Promise<PlanStatusRow[]> {
  return memo('activePlanStatuses', PLAN_STATUS_CACHE_MS, async () => {
    const res = await rows<{ invoiceId: string; status: string | null }>(sql`
      SELECT bd.invoice_id AS invoiceId, b.status AS status
      FROM bankpo_payment_detail bd
      JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
      WHERE b.type = 0
        AND b.status IN (${inList([...ACTIVE_VOUCHER_STATUSES])})
    `)
    return res.map((r) => ({ invoiceId: String(r.invoiceId), status: r.status || '' }))
  })
}
