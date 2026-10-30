import type { Lang } from '~/lib/core/types'
import { formatDate } from '~/lib/format/date'
import { formatMoneyFull } from '~/lib/format/number'
import { useTranslation } from 'react-i18next'
import { EntityCaption } from '~/components/neraca/EntityCaption'

export type JournalItem = {
  id: string
  journalNumber: string
  transDate: string
  journalTypeLabel: string
  memo: string
  debet: string
  credit: string
  /** Owning entity of the line; null = no entity. Only shown when `showEntity` is true. */
  entityName: string | null
}

export interface JournalListProps {
  items: JournalItem[]
  lang: Lang
  /** True when several entities are in scope: each line then names its entity under the journal number. */
  showEntity: boolean
}

export function JournalList({ items, lang, showEntity }: JournalListProps) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-ink-muted text-sm">
        {t('ui.journalList.noJournalLines')}
      </div>
    )
  }

  return (
    <div className="nr-table-wrap">
      <table className="nr-table">
        <thead>
          <tr>
            <th>{t('ui.journalList.journalNo')}</th>
            <th>{t('ui.journalList.date')}</th>
            <th>{t('ui.journalList.type')}</th>
            <th>{t('ui.journalList.memo')}</th>
            <th className="nr-r">{t('ui.journalList.debitIdr')}</th>
            <th className="nr-r">{t('ui.journalList.creditIdr')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((j) => (
            <tr key={j.id}>
              <td>
                <span className="nr-code">{j.journalNumber}</span>
                {showEntity && <EntityCaption name={j.entityName} />}
              </td>
              <td className="text-sm">{formatDate(j.transDate, lang)}</td>
              <td>
                <span className="nr-chip nr-chip-5 text-xs font-normal">
                  {j.journalTypeLabel}
                </span>
              </td>
              <td className="max-w-xs truncate text-sm" title={j.memo}>
                {j.memo || '—'}
              </td>
              <td className="nr-r font-mono text-sm">
                {formatMoneyFull(j.debet, lang)}
              </td>
              <td className="nr-r font-mono text-sm">
                {formatMoneyFull(j.credit, lang)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
