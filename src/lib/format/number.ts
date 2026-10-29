import Decimal from 'decimal.js'
import type { Lang, Money } from '~/lib/finance/types'

// One number style for every language: 1,000,000.50 (the `lang` parameters below are kept only so
// call sites do not change; they no longer affect separators or units).
const THIN_SPACE = '\u2009'
const MINUS_SIGN = '\u2212'
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

  const unitStr = unit
  const minus = isNeg ? MINUS_SIGN : ''

  return `${minus}${CURRENCY_PREFIX}${THIN_SPACE}${formattedNum}${unitStr}`
}

/** Same as formatMoneyShort but without the currency prefix (the KPI card renders it separately). */
export function formatAmountShort(value: Money, _lang?: Lang): string {
  const d = new Decimal(value || 0)
  const isNeg = d.isNegative() && !d.isZero()
  const { formattedNum, unit } = getScaledShort(d.abs())
  const unitStr = unit
  return `${isNeg ? MINUS_SIGN : ''}${formattedNum}${unitStr}`
}

export function formatMoneyFull(
  value: Money,
  _lang?: Lang,
  opts?: { decimals?: 0 | 2 },
): string {
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

export function formatPercent(
  ratio: string | null,
  _lang?: Lang,
  decimals: number = 2,
): string {
  if (ratio === null || ratio === undefined || ratio === '') return '—'
  const d = new Decimal(ratio).times(100)
  const rounded = d.toFixed(decimals, Decimal.ROUND_HALF_UP)
  return `${rounded}%`
}

export function formatAxisShort(value: number, _lang?: Lang): string {
  const d = new Decimal(value)
  if (d.isZero()) return '0'
  const isNeg = d.isNegative()
  const abs = d.abs()

  const { formattedNum, unit } = getScaledShort(abs)
  const cleanNum = formattedNum.replace(/\.00$/, '')
  const unitStr = unit
  const minus = isNeg ? MINUS_SIGN : ''

  return `${minus}${cleanNum}${unitStr}`
}
