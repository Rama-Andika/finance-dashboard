import type { Lang } from '~/lib/finance/types'
import { cn } from '~/lib/cn'

export interface DeltaPillProps {
  change: string | null
  higherIsBetter: boolean
  lang: Lang
  className?: string
}

export function DeltaPill({ change, higherIsBetter, lang, className }: DeltaPillProps) {
  if (change === null) {
    return <span className={cn('nr-delta nr-delta-flat', className)}>–</span>
  }

  const raw = change.replace('%', '').trim()
  const val = Number.parseFloat(raw)

  if (Number.isNaN(val) || val === 0) {
    const formattedZero = lang === 'id' ? '0,00%' : '0.00%'
    return <span className={cn('nr-delta nr-delta-flat', className)}>– {formattedZero}</span>
  }

  const isUp = val > 0
  const isGood = isUp ? higherIsBetter : !higherIsBetter
  const arrow = isUp ? '▲' : '▼'
  const absVal = Math.abs(val).toFixed(2)
  const displayVal = lang === 'id' ? absVal.replace('.', ',') : absVal

  const toneClass = isGood ? 'nr-delta-up' : 'nr-delta-down'

  return (
    <span className={cn('nr-delta', toneClass, className)}>
      {arrow} {displayVal}%
    </span>
  )
}
