import Decimal from 'decimal.js'
import type { Lang, Money } from '~/lib/finance/types'

const THIN_SPACE = '\u2009'
const NBSP = '\u00a0'
const MINUS_SIGN = '\u2212'

type Tier = {
  threshold: Decimal
  unit: { id: string; en: string }
}

const TIERS: Tier[] = [
  { threshold: new Decimal(1e12), unit: { id: 'T', en: 'T' } },
  { threshold: new Decimal(1e9), unit: { id: 'M', en: 'B' } },
  { threshold: new Decimal(1e6), unit: { id: 'Jt', en: 'M' } },
  { threshold: new Decimal(1e3), unit: { id: 'Rb', en: 'K' } },
]

function getScaledShort(absVal: Decimal, lang: Lang): { formattedNum: string; unit: string } {
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
        const higherFormatted = lang === 'id' ? higherRounded.replace('.', ',') : higherRounded
        return { formattedNum: higherFormatted, unit: higherTier.unit[lang] }
      }
      const formatted = lang === 'id' ? rounded.replace('.', ',') : rounded
      return { formattedNum: formatted, unit: tier.unit[lang] }
    }
  }

  return { formattedNum: absVal.toFixed(0, Decimal.ROUND_HALF_UP), unit: '' }
}

export function formatMoneyShort(value: Money, lang: Lang): string {
  const d = new Decimal(value || 0)
  const isNeg = d.isNegative() && !d.isZero()
  const abs = d.abs()

  const prefix = lang === 'id' ? 'Rp' : 'IDR'
  const { formattedNum, unit } = getScaledShort(abs, lang)

  const unitStr = unit ? (lang === 'id' ? `${NBSP}${unit}` : unit) : ''
  const minus = isNeg ? MINUS_SIGN : ''

  return `${minus}${prefix}${THIN_SPACE}${formattedNum}${unitStr}`
}

/** Same as formatMoneyShort but without the currency prefix (the KPI card renders it separately). */
export function formatAmountShort(value: Money, lang: Lang): string {
  const d = new Decimal(value || 0)
  const isNeg = d.isNegative() && !d.isZero()
  const { formattedNum, unit } = getScaledShort(d.abs(), lang)
  const unitStr = unit ? (lang === 'id' ? `${NBSP}${unit}` : unit) : ''
  return `${isNeg ? MINUS_SIGN : ''}${formattedNum}${unitStr}`
}

export function formatMoneyFull(
  value: Money,
  lang: Lang,
  opts?: { decimals?: 0 | 2 },
): string {
  const decimals = opts?.decimals ?? 0
  const d = new Decimal(value || 0)
  const isNeg = d.isNegative() && !d.isZero()
  const abs = d.abs()

  const roundedStr = abs.toFixed(decimals, Decimal.ROUND_HALF_UP)
  const [intPart = '', decPart] = roundedStr.split('.')

  const thousandSep = lang === 'id' ? '.' : ','
  const decimalSep = lang === 'id' ? ',' : '.'

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep)
  const result = decPart !== undefined && decimals > 0 ? `${formattedInt}${decimalSep}${decPart}` : formattedInt

  return isNeg ? `(${result})` : result
}

export function formatPercent(
  ratio: string | null,
  lang: Lang = 'id',
  decimals: number = 2,
): string {
  if (ratio === null || ratio === undefined || ratio === '') return '—'
  const d = new Decimal(ratio).times(100)
  const rounded = d.toFixed(decimals, Decimal.ROUND_HALF_UP)
  const formatted = lang === 'id' ? rounded.replace('.', ',') : rounded
  return `${formatted}%`
}

export function formatAxisShort(value: number, lang: Lang): string {
  const d = new Decimal(value)
  if (d.isZero()) return '0'
  const isNeg = d.isNegative()
  const abs = d.abs()

  const { formattedNum, unit } = getScaledShort(abs, lang)
  const cleanNum = formattedNum.replace(/[,.]00$/, '')
  const unitStr = unit ? (lang === 'id' ? ` ${unit}` : unit) : ''
  const minus = isNeg ? MINUS_SIGN : ''

  return `${minus}${cleanNum}${unitStr}`
}
