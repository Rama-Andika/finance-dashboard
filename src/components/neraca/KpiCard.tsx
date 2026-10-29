import Decimal from 'decimal.js'
import { useTranslation } from 'react-i18next'
import type { Lang, Money } from '~/lib/finance/types'
import { DeltaPill } from '~/components/neraca/DeltaPill'
import { FigureTooltip } from '~/components/neraca/FigureTooltip'
import { formatAmountShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
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
  /** Defaults to "Rp" (ID) / "IDR" (EN). */
  currency?: string
  className?: string
}

const MONEY_RE = /^-?\d+(\.\d+)?$/

function isMoney(value: string | null | undefined): value is Money {
  return typeof value === 'string' && MONEY_RE.test(value)
}

/** Percent change against the comparison value, computed with decimal.js (G12). */
function computeChangePercent(current: Money | null, previous: Money | null | undefined): string | null {
  if (!isMoney(current) || !isMoney(previous)) return null
  const prev = new Decimal(previous)
  if (prev.isZero()) return null
  return new Decimal(current).minus(prev).div(prev.abs()).times(100).toFixed(2)
}

export function KpiCard({
  label,
  value,
  compareValue,
  compareLabel,
  higherIsBetter,
  onOpen,
  hint,
  currency,
  className,
}: KpiCardProps) {
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language?.startsWith('id') ? 'id' : 'en'
  const currencyLabel = currency ?? (lang === 'id' ? 'Rp' : 'IDR')

  const valueIsMoney = isMoney(value)
  const changePercent = computeChangePercent(value, compareValue)
  const shortValue = value === null ? '–' : valueIsMoney ? formatAmountShort(value, lang) : value
  const fullValue = valueIsMoney ? `${currencyLabel} ${formatMoneyFull(value, lang, { decimals: 2 })}` : (value ?? '–')
  const compareShort = isMoney(compareValue) ? formatMoneyShort(compareValue, lang) : ''

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
          {valueIsMoney && <span className="nr-cur">{currencyLabel}</span>}
          {shortValue}
        </p>
      </FigureTooltip>

      {(changePercent !== null || compareLabel) && (
        <div className="nr-kpi-foot">
          {changePercent !== null && (
            <DeltaPill change={changePercent} higherIsBetter={higherIsBetter ?? true} lang={lang} />
          )}
          {compareLabel && (
            <span>
              {compareLabel} {compareShort}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
