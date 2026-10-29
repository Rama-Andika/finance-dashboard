import type { Money } from '~/lib/finance/types'
import { DeltaPill } from '~/components/neraca/DeltaPill'
import { FigureTooltip } from '~/components/neraca/FigureTooltip'
import { cn } from '~/lib/cn'

export interface KpiCardProps {
  label: string
  value: Money | null
  compareValue?: Money | null
  compareLabel?: string
  higherIsBetter?: boolean
  onOpen?: () => void
  hint?: string
  currency?: string
  className?: string
}

function computeChangePercent(current: Money | null, previous: Money | null | undefined): string | null {
  if (current === null || previous === null || previous === undefined) return null
  const curr = Number.parseFloat(current)
  const prev = Number.parseFloat(previous)
  if (Number.isNaN(curr) || Number.isNaN(prev) || prev === 0) return null
  const change = ((curr - prev) / Math.abs(prev)) * 100
  return change.toFixed(2)
}

function formatShortMock(val: Money | null): string {
  if (val === null) return '–'
  const n = Number.parseFloat(val)
  if (Number.isNaN(n)) return val
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2).replace('.', ',')} T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace('.', ',')} M`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace('.', ',')} jt`
  return n.toLocaleString('id-ID')
}

export function KpiCard({
  label,
  value,
  compareValue,
  compareLabel,
  higherIsBetter,
  onOpen,
  hint,
  currency = 'Rp',
  className,
}: KpiCardProps) {
  const changePercent = computeChangePercent(value, compareValue)
  const shortValue = formatShortMock(value)
  const fullValue = value ? `${currency} ${Number.parseFloat(value).toLocaleString('id-ID')}` : '–'
  const compareShort = compareValue ? `${currency} ${formatShortMock(compareValue)}` : ''

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
      aria-label={isClickable ? `${label}: ${shortValue}` : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="nr-kpi-label">{label}</h3>
        {hint && <span className="nr-muted text-xs">{hint}</span>}
      </div>

      <FigureTooltip full={fullValue}>
        <p className="nr-kpi-value">
          <span className="nr-cur">{currency}</span>
          {shortValue}
        </p>
      </FigureTooltip>

      {(changePercent !== null || compareLabel) && (
        <div className="nr-kpi-foot">
          {changePercent !== null && (
            <DeltaPill change={changePercent} higherIsBetter={higherIsBetter ?? true} lang="id" />
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
