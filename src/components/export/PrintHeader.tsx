import React from 'react'
import { useTranslation } from 'react-i18next'
import type { Lang } from '~/lib/finance/types'
import { formatDate } from '~/lib/format/date'

export interface PrintHeaderProps {
  title: string
  entity?: string
  preset?: string
  asOf?: string
}

export function PrintHeader({ title, entity, preset, asOf }: PrintHeaderProps) {
  const { i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang
  const printTimestamp = new Date().toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="print-only mb-6 pb-4 border-b border-[#cfd8d2] text-[#111111]">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold tracking-tight m-0 text-black">
            Neraca — {title}
          </h1>
          <p className="text-xs text-neutral-600 mt-1 mb-0">
            {lang === 'id' ? 'Entitas' : 'Entity'}:{' '}
            <span className="font-semibold">{entity || 'Semua Entitas (All)'}</span>
            {' · '}
            {lang === 'id' ? 'Periode' : 'Period'}:{' '}
            <span className="font-semibold">{preset || 'this-month'}</span>
            {asOf && (
              <>
                {' · '}
                <span>As of {formatDate(asOf, lang)}</span>
              </>
            )}
          </p>
        </div>
        <div className="text-right text-[11px] text-neutral-500">
          <span>
            {lang === 'id' ? 'Waktu Cetak' : 'Printed on'}: {printTimestamp}
          </span>
        </div>
      </div>
    </div>
  )
}
