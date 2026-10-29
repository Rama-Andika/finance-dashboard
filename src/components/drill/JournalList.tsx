import type { Lang } from '~/lib/finance/types'
import { formatDate } from '~/lib/format/date'
import { formatMoneyFull } from '~/lib/format/number'

export type JournalItem = {
  id: string
  journalNumber: string
  transDate: string
  journalTypeLabel: string
  memo: string
  debet: string
  credit: string
}

export interface JournalListProps {
  items: JournalItem[]
  lang: Lang
}

export function JournalList({ items, lang }: JournalListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted text-sm">
        {lang === 'id' ? 'Tidak ada baris jurnal' : 'No journal lines'}
      </div>
    )
  }

  return (
    <div className="nr-table-wrap">
      <table className="nr-table">
        <thead>
          <tr>
            <th>{lang === 'id' ? 'No. Jurnal' : 'Journal No.'}</th>
            <th>{lang === 'id' ? 'Tanggal' : 'Date'}</th>
            <th>{lang === 'id' ? 'Tipe' : 'Type'}</th>
            <th>{lang === 'id' ? 'Keterangan' : 'Memo'}</th>
            <th className="nr-r">{lang === 'id' ? 'Debet (Rp)' : 'Debit (IDR)'}</th>
            <th className="nr-r">{lang === 'id' ? 'Kredit (Rp)' : 'Credit (IDR)'}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((j) => (
            <tr key={j.id}>
              <td>
                <span className="nr-code">{j.journalNumber}</span>
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
