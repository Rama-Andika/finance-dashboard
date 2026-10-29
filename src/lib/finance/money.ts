import Decimal from 'decimal.js'
import type { Money } from './types'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export const D = (v: Money | number | null | undefined): Decimal =>
  new Decimal(v === null || v === undefined || v === '' ? 0 : v)

export const sum = (values: (Money | null | undefined)[]): Money =>
  values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0)).toFixed(2)

export const toMoney = (d: Decimal): Money => d.toFixed(2)

/** Safe division: divisor 0 → null (the UI shows "—"). */
export const safeDiv = (a: Money, b: Money): string | null =>
  D(b).isZero() ? null : D(a).div(D(b)).toString()
