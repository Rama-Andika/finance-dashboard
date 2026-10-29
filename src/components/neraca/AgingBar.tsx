import React from 'react'
import Decimal from 'decimal.js'
import type { IsoDate, Lang, Money } from '~/lib/core/types'
import { formatMoneyShort } from '~/lib/format/number'
import { formatDate } from '~/lib/format/date'
import { useTranslation } from 'react-i18next'

export type AgingBucketKey = 'notDue' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus'

export interface AgingSegment {
  key: AgingBucketKey
  label: string
  amount: Money
}

export interface AgingBarProps {
  title: string
  asOf: IsoDate
  total: Money
  segments: AgingSegment[]
  lang: Lang
  onSelect?: (key: AgingBucketKey) => void
}

const BUCKET_ORDER: AgingBucketKey[] = ['notDue', 'd0_30', 'd31_60', 'd61_90', 'd90plus']
const BUCKET_CLASS_MAP: Record<AgingBucketKey, string> = {
  notDue: 'nr-ag-0',
  d0_30: 'nr-ag-1',
  d31_60: 'nr-ag-2',
  d61_90: 'nr-ag-3',
  d90plus: 'nr-ag-4',
}

export function AgingBar({ title, asOf, total, segments, lang, onSelect }: AgingBarProps) {
  const { t } = useTranslation()
  const totalDec = new Decimal(total || '0').abs()
  const segmentMap = new Map(segments.map((s) => [s.key, s]))

  // Normalize all 5 buckets in canonical order
  const orderedSegments = BUCKET_ORDER.map((key) => {
    const existing = segmentMap.get(key)
    const amount = existing?.amount ?? '0'
    const label = existing?.label ?? key
    const dec = new Decimal(amount).abs()
    return {
      key,
      label,
      amount,
      dec,
      className: BUCKET_CLASS_MAP[key],
    }
  })

  // Calculate percentages that sum to 100%
  let percentages: number[] = []
  if (totalDec.isZero()) {
    percentages = orderedSegments.map(() => 0)
  } else {
    const rawPcts = orderedSegments.map((s) => s.dec.div(totalDec).times(100).toNumber())
    const floorPcts = rawPcts.map((p) => Math.floor(p))
    const remainders = rawPcts.map((p, idx) => ({ idx, rem: p - floorPcts[idx]! }))
    remainders.sort((a, b) => b.rem - a.rem)

    let deficit = 100 - floorPcts.reduce((a, b) => a + b, 0)
    percentages = [...floorPcts]
    for (let i = 0; i < deficit && i < remainders.length; i++) {
      const idx = remainders[i]!.idx
      percentages[idx]! += 1
    }
  }

  // Accessible description
  const ariaParts = orderedSegments
    .map((s, idx) => `${s.label} ${percentages[idx]} ${t('ui.agingBar.percent')}`)
    .join(', ')

  return (
    <section className="nr-card nr-aging">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{title}</h3>
        <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
          {t('ui.agingBar.total')} {formatMoneyShort(total, lang)}{' '}
          {t('ui.agingBar.asOf')} {formatDate(asOf, lang)}
        </span>
      </div>

      <div className="nr-aging-bar" role="img" aria-label={ariaParts}>
        {orderedSegments.map((s, idx) => {
          const pct = percentages[idx] || 0
          if (pct === 0) return null
          return (
            <span
              key={s.key}
              className={s.className}
              style={{
                width: `${pct}%`,
                cursor: onSelect ? 'pointer' : 'default',
              }}
              onClick={() => onSelect?.(s.key)}
              title={`${s.label}: ${pct}% (${formatMoneyShort(s.amount, lang)})`}
            />
          )
        })}
      </div>

      <dl className="nr-aging-keys">
        {orderedSegments.map((s) => {
          return (
            <div
              key={s.key}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={() => onSelect?.(s.key)}
            >
              <dt>
                <i className={s.className} />
                {s.label}
              </dt>
              <dd>{formatMoneyShort(s.amount, lang)}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
