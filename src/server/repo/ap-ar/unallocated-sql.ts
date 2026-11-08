import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { AGING_SIDES, IN_OUT_VALUES, intList, type AgingSide } from '~/server/db/erp-codes'
import { locationFilter } from '~/server/repo/ap-ar/shared'
import type { Id, IsoDate } from '~/lib/core/types'

type SideConfig = (typeof AGING_SIDES)[AgingSide]

/** Cards of the side that have no detail row of their own, at their full amount: the AP payments without allocation. */
export function paymentsWithoutDetailQuery(cfg: SideConfig, asOfPlusOne: IsoDate, locSlice: Id[] | undefined): SQL {
  return sql`
        SELECT p.ap_ar_card_id AS cardId,
               p.owner_id AS partyId,
               p.location_id AS locationId,
               p.coa_id AS coaId,
               DATE(p.transaction_date) AS txDate,
               p.amount * p.in_out AS balance
        FROM ap_ar_card p
        WHERE p.module_type = ${cfg.module}
          AND p.transaction_type IN (${intList(cfg.unallocatedTypes)})
          AND p.in_out IN (${intList(IN_OUT_VALUES)})
          AND p.transaction_date < ${asOfPlusOne}
          ${locationFilter('p', locSlice)}
          AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)
      `
}

/**
 * The AR direct returns (cards without a detail row of their own) with what is left of them: the amount minus the
 * allocations that name the return as `invoice_id`, from settlement cards dated before `asOfPlusOne`. A return that a
 * settlement card used up completely has a balance of 0 and is left out.
 */
export function directReturnsQuery(cfg: SideConfig, asOfPlusOne: IsoDate, locSlice: Id[] | undefined): SQL {
  return sql`
        SELECT r.ap_ar_card_id AS cardId,
               r.owner_id AS partyId,
               r.location_id AS locationId,
               r.coa_id AS coaId,
               DATE(r.transaction_date) AS txDate,
               r.amount * r.in_out + COALESCE(SUM(CASE WHEN p.ap_ar_card_id IS NOT NULL THEN d.amount END), 0) AS balance
        FROM ap_ar_card r
        LEFT JOIN ap_ar_card_detail d ON d.invoice_id = r.ap_ar_card_id
        LEFT JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
                              AND p.transaction_date < ${asOfPlusOne}
                              AND p.in_out IN (${intList(IN_OUT_VALUES)})
                              AND p.module_type = ${cfg.module}
                              AND p.transaction_type IN (${intList(cfg.settlementTypes)})
        WHERE r.module_type = ${cfg.module}
          AND r.transaction_type IN (${intList(cfg.unallocatedTypes)})
          AND r.in_out IN (${intList(IN_OUT_VALUES)})
          AND r.transaction_date < ${asOfPlusOne}
          ${locationFilter('r', locSlice)}
          AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail o WHERE o.ap_ar_card_id = r.ap_ar_card_id)
        GROUP BY r.ap_ar_card_id, r.owner_id, r.location_id, r.coa_id, DATE(r.transaction_date), r.amount, r.in_out
        HAVING balance <> 0
      `
}

/** The query that lists the unallocated cards of one side: the returns of AR, the payments of AP (see `AGING_SIDES`). */
export function unallocatedQuery(cfg: SideConfig, asOfPlusOne: IsoDate, locSlice: Id[] | undefined): SQL {
  return cfg.unallocatedAllocatedLater
    ? directReturnsQuery(cfg, asOfPlusOne, locSlice)
    : paymentsWithoutDetailQuery(cfg, asOfPlusOne, locSlice)
}
