import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { translateCfLabel } from '~/lib/finance/cash/cashflow-labels'
import { PlanStatusPill } from '~/components/neraca/PlanStatusPill'
import { EntityCaption } from '~/components/neraca/EntityCaption'
import { formatMoneyFull } from '~/lib/format/number'
import { formatDate } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'

export type DrillColumn = { id: string; labelKey: string; kind: string }
export type DrillRow = Record<string, string | null>

function DrillCell({
  column,
  value,
  lang,
  caption,
}: {
  column: DrillColumn
  value: string | null | undefined
  lang: Lang
  /** Entity caption under the value. Only the first column gets one, and it is drawn by 'code' and text cells. */
  caption?: ReactNode
}) {
  const { t } = useTranslation()
  switch (column.kind) {
    case 'money':
      return <td className="nr-r nr-num text-sm">{formatMoneyFull(value ?? '0', lang)}</td>
    case 'number':
      return <td className="nr-r nr-num text-sm">{value ?? '—'}</td>
    case 'code':
      return (
        <td>
          <span className="nr-code">{value || '—'}</span>
          {caption}
        </td>
      )
    case 'date':
      return <td className="text-sm">{value ? formatDate(value, lang) : '—'}</td>
    case 'status':
      return <td>{value ? <PlanStatusPill status={value} /> : '—'}</td>
    default:
      return (
        <td className="text-sm">
          {value ? translateCfLabel(t, value) : '—'}
          {caption}
        </td>
      )
  }
}

/** The rows of one drill level. A row is clickable when the next level exists. */
export function DrillTable({
  columns,
  rows,
  hasNext,
  showEntity,
  lang,
  onRowClick,
}: {
  columns: DrillColumn[]
  rows: DrillRow[]
  hasNext: boolean
  /** True when rows carry `entityName` (several entities in scope): it is shown under the first column. */
  showEntity: boolean
  lang: Lang
  onRowClick: (row: DrillRow) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="nr-table-wrap">
      <table className="nr-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} className={c.kind === 'money' || c.kind === 'number' ? 'nr-r' : undefined}>
                {t(c.labelKey)}
              </th>
            ))}
            {hasNext && <th className="w-10"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (hasNext ? 1 : 0)} className="text-center py-10 text-ink-muted text-sm">
                {t('drill.empty')}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={row.id ?? rowIdx}
                onClick={() => onRowClick(row)}
                className={hasNext ? 'cursor-pointer hover:bg-canvas/60 transition' : undefined}
              >
                {columns.map((c, colIdx) => (
                  <DrillCell
                    key={c.id}
                    column={c}
                    value={row[c.id]}
                    lang={lang}
                    caption={showEntity && colIdx === 0 ? <EntityCaption name={row.entityName ?? null} /> : undefined}
                  />
                ))}
                {hasNext && (
                  <td className="text-right text-ink-muted pr-3">
                    <ChevronRight className="w-4 h-4 inline" />
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
