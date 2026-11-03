import Decimal from 'decimal.js'
import type { Lang, Money } from '../core/types'
import { formatAmountShort, formatMoneyFull, formatMoneyShort } from './number'

const MONEY_RE = /^-?\d+(\.\d+)?$/

/** A money string such as "1234.50"; anything else (a runway label, a dash) is plain text. */
export function isMoney(value: string | null | undefined): value is Money {
  return typeof value === 'string' && MONEY_RE.test(value)
}

/** Percent change against the comparison value, computed with decimal.js (G12); null when it cannot be computed. */
export function computeChangePercent(current: Money | null, previous: Money | null | undefined): string | null {
  if (!isMoney(current) || !isMoney(previous)) return null
  const prev = new Decimal(previous)
  if (prev.isZero()) return null
  return new Decimal(current).minus(prev).div(prev.abs()).times(100).toFixed(2)
}

export type KpiFigures = {
  /** The value is a money string, so it gets a currency label and a tooltip with the full amount. */
  valueIsMoney: boolean
  /** The abbreviated figure shown on the card ("–" for no value, the text itself for plain text). */
  shortValue: string
  /** The full figure for the tooltip and the accessible name. */
  fullValue: string
  /** The comparison value, abbreviated; empty when there is none. */
  compareShort: string
  changePercent: string | null
}

/** Everything a KPI card shows for a value and its comparison value. */
export function kpiFigures(input: {
  value: Money | null
  compareValue: Money | null | undefined
  currency: string
  lang: Lang
}): KpiFigures {
  const { value, compareValue, currency, lang } = input
  const valueIsMoney = isMoney(value)
  return {
    valueIsMoney,
    shortValue: value === null ? '–' : valueIsMoney ? formatAmountShort(value, lang) : value,
    fullValue: valueIsMoney ? `${currency} ${formatMoneyFull(value, lang, { decimals: 2 })}` : (value ?? '–'),
    compareShort: isMoney(compareValue) ? formatMoneyShort(compareValue, lang) : '',
    changePercent: computeChangePercent(value, compareValue),
  }
}
