import Decimal from 'decimal.js'
import type { Money } from './types'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export const D = (v: Money | number | null | undefined): Decimal =>
  new Decimal(v === null || v === undefined || v === '' ? 0 : v)

export const sum = (values: (Money | null | undefined)[]): Money =>
  values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0)).toFixed(2)

/** Safe division: divisor 0 → null (the UI shows "—"). */
export const safeDiv = (a: Money, b: Money): string | null =>
  D(b).isZero() ? null : D(a).div(D(b)).toString()

/** Display only: a JS number for chart libraries that cannot take strings; never use it for arithmetic on money. Unparsable → 0. */
export const toChartNumber = (v: Money | null | undefined): number => Number(v) || 0

/** The item with the largest `amount` (the first one on a tie), compared as exact money. */
export function largestByAmount<T extends { amount: Money }>(items: readonly T[]): T | undefined {
  let best: T | undefined
  for (const item of items) {
    if (!best || D(item.amount).gt(D(best.amount))) best = item
  }
  return best
}
