import { D } from '../../core/money'
import type { Money } from '../../core/types'

/** A difference below this amount (in rupiah) is rounding, not a real gap. */
export const RECONCILIATION_TOLERANCE = 1

export type AgingReconciliation = { gl: Money; subledger: Money; diff: Money; inSync: boolean }

/** Compares the GL balance of the control accounts with the sub-ledger (open items) total. */
export function reconcileAging(glTotal: Money, subledgerTotal: Money): AgingReconciliation {
  const diff = D(glTotal).minus(D(subledgerTotal)).toFixed(2)
  return {
    gl: glTotal,
    subledger: subledgerTotal,
    diff,
    inSync: D(diff).abs().lt(RECONCILIATION_TOLERANCE),
  }
}
