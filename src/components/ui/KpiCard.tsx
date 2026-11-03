import { useTranslation } from 'react-i18next'
import type { Lang, Money } from '~/lib/core/types'
import { DeltaPill } from '~/components/ui/DeltaPill'
import { FigureTooltip } from '~/components/ui/FigureTooltip'
import { kpiFigures } from '~/lib/format/kpi'
import { cn } from '~/lib/cn'

export interface KpiCardProps {
  label: string
  /** A money string ("1234.50"), or plain text such as a runway label. */
  value: Money | null
  compareValue?: Money | null
  compareLabel?: string
  higherIsBetter?: boolean
  onOpen?: () => void
  hint?: string
  /** Defaults to "IDR". */
  currency?: string
  className?: string
}

/** The line under the figure: the change against the comparison value and what it is compared with. */
function KpiFoot({
  changePercent,
  higherIsBetter,
  compareLabel,
  compareShort,
}: {
  changePercent: string | null
  higherIsBetter: boolean
  compareLabel: string | undefined
  compareShort: string
}) {
  if (changePercent === null && !compareLabel) return null
  return (
    <div className="nr-kpi-foot">
      {changePercent !== null && <DeltaPill change={changePercent} higherIsBetter={higherIsBetter} />}
      {compareLabel && (
        <span>
          {compareLabel} {compareShort}
        </span>
      )}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  compareValue,
  compareLabel,
  higherIsBetter = true,
  onOpen,
  hint,
  currency = 'IDR',
  className,
}: KpiCardProps) {
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language?.startsWith('id') ? 'id' : 'en'
  const { valueIsMoney, shortValue, fullValue, compareShort, changePercent } = kpiFigures({
    value,
    compareValue,
    currency,
    lang,
  })

  const isClickable = Boolean(onOpen)

  return (
    <article
      className={cn(
        'nr-card nr-kpi',
        isClickable && 'cursor-pointer hover:border-line-strong transition-colors',
        className,
      )}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? 'button' : undefined}
      aria-label={isClickable ? `${label}: ${fullValue}` : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="nr-kpi-label">{label}</h3>
        {hint && <span className="nr-muted text-xs">{hint}</span>}
      </div>

      <FigureTooltip full={fullValue}>
        <p className={cn('nr-kpi-value', !valueIsMoney && 'text-2xl lg:text-3xl whitespace-normal leading-tight')}>
          {valueIsMoney && <span className="nr-cur">{currency}</span>}
          {shortValue}
        </p>
      </FigureTooltip>

      <KpiFoot
        changePercent={changePercent}
        higherIsBetter={higherIsBetter}
        compareLabel={compareLabel}
        compareShort={compareShort}
      />
    </article>
  )
}
