import Decimal from 'decimal.js'
import type { Lang, Money } from '~/lib/core/types'

// One number style for every language: 1,000,000.50 (the `lang` parameters below are kept only so
// call sites do not change; they no longer affect separators or units).
const THIN_SPACE = '\u2009'
const CURRENCY_PREFIX = 'IDR'

type Tier = {
  threshold: Decimal
  unit: string
}

const TIERS: Tier[] = [
  { threshold: new Decimal(1e12), unit: 'T' },
  { threshold: new Decimal(1e9), unit: 'B' },
  { threshold: new Decimal(1e6), unit: 'M' },
  { threshold: new Decimal(1e3), unit: 'K' },
]

function getScaledShort(absVal: Decimal): { formattedNum: string; unit: string } {
  if (absVal.lt(1000)) {
    const roundedZero = absVal.toFixed(0, Decimal.ROUND_HALF_UP)
    if (new Decimal(roundedZero).lt(1000)) {
      return { formattedNum: roundedZero, unit: '' }
    }
  }

  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i]!
    const scaled = absVal.div(tier.threshold)
    const rounded = scaled.toFixed(2, Decimal.ROUND_HALF_UP)
    const roundedDec = new Decimal(rounded)

    if (roundedDec.gte(1) || i === TIERS.length - 1) {
      if (roundedDec.gte(1000) && i > 0) {
        const higherTier = TIERS[i - 1]!
        const higherScaled = absVal.div(higherTier.threshold)
        const higherRounded = higherScaled.toFixed(2, Decimal.ROUND_HALF_UP)
        return { formattedNum: higherRounded, unit: higherTier.unit }
      }
      return { formattedNum: rounded, unit: tier.unit }
    }
  }

  return { formattedNum: absVal.toFixed(0, Decimal.ROUND_HALF_UP), unit: '' }
}

export function formatMoneyShort(value: Money, _lang?: Lang): string {
  const d = new Decimal(value || 0)
  const isNeg = d.isNegative() && !d.isZero()
  const abs = d.abs()

  const { formattedNum, unit } = getScaledShort(abs)

  const text = `${CURRENCY_PREFIX}${THIN_SPACE}${formattedNum}${unit}`

  // Accounting style: a negative amount is written in parentheses, not with a minus sign.
  return isNeg ? `(${text})` : text
}

/** Same as formatMoneyShort but without the currency prefix (the KPI card renders it separately). */
export function formatAmountShort(value: Money, _lang?: Lang): string {
  const d = new Decimal(value || 0)
  const isNeg = d.isNegative() && !d.isZero()
  const { formattedNum, unit } = getScaledShort(d.abs())
  const text = `${formattedNum}${unit}`
  return isNeg ? `(${text})` : text
}

export function formatMoneyFull(value: Money, _lang?: Lang, opts?: { decimals?: 0 | 2 }): string {
  const decimals = opts?.decimals ?? 0
  const d = new Decimal(value || 0)
  const isNeg = d.isNegative() && !d.isZero()
  const abs = d.abs()

  const roundedStr = abs.toFixed(decimals, Decimal.ROUND_HALF_UP)
  const [intPart = '', decPart] = roundedStr.split('.')

  const thousandSep = ','
  const decimalSep = '.'

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep)
  const result = decPart !== undefined && decimals > 0 ? `${formattedInt}${decimalSep}${decPart}` : formattedInt

  return isNeg ? `(${result})` : result
}

export function formatPercent(ratio: string | null, _lang?: Lang, decimals: number = 2): string {
  if (ratio === null || ratio === undefined || ratio === '') return '—'
  const d = new Decimal(ratio).times(100)
  const rounded = d.toFixed(decimals, Decimal.ROUND_HALF_UP)
  return `${rounded}%`
}

/** Percent points (not a ratio) under which a change is written as "<0.0001%" instead of a long run of zeros. */
const TINY_PERCENT = new Decimal('0.0001')
/** Percent points from which a change is written with one decimal, like every other percent in the app. */
const PLAIN_PERCENT = new Decimal('0.1')

/**
 * A change as percent text that never looks like zero when it is not zero (the change column of the balance sheet):
 * - null (no comparison amount) gives "—" and exactly zero gives "0.0%";
 * - 0.1% and above: one decimal ("12.5%");
 * - from 0.0001% up to 0.1%: as many decimals as it takes to show the first digit that is not zero ("0.001%");
 * - under 0.0001%: "<0.0001%";
 * - a negative change is in parentheses, like every negative amount ("(12.5%)", "(<0.0001%)").
 */
export function formatChangePercent(ratio: string | null): string {
  if (ratio === null || ratio === '') return '—'
  const percent = new Decimal(ratio).times(100)
  if (percent.isZero()) return '0.0%'
  const abs = percent.abs()
  let text: string
  if (abs.lt(TINY_PERCENT)) {
    text = `<${TINY_PERCENT.toFixed()}%`
  } else if (abs.gte(PLAIN_PERCENT)) {
    text = `${abs.toFixed(1, Decimal.ROUND_HALF_UP)}%`
  } else {
    // abs.e is the power of ten of the first digit that is not zero (-3 for 0.0014), so -abs.e decimals show that digit.
    const decimals = -abs.e
    const rounded = abs.toFixed(decimals, Decimal.ROUND_HALF_UP)
    // Rounding can carry into the next power of ten (0.0996 becomes 0.10): then the zero at the end is left out.
    const carried = new Decimal(rounded).e > abs.e
    text = `${carried ? abs.toFixed(decimals - 1, Decimal.ROUND_HALF_UP) : rounded}%`
  }
  return percent.isNegative() ? `(${text})` : text
}

export function formatAxisShort(value: number, _lang?: Lang): string {
  const d = new Decimal(value)
  if (d.isZero()) return '0'
  const isNeg = d.isNegative()
  const abs = d.abs()

  const { formattedNum, unit } = getScaledShort(abs)
  const cleanNum = formattedNum.replace(/\.00$/, '')
  const text = `${cleanNum}${unit}`

  return isNeg ? `(${text})` : text
}
