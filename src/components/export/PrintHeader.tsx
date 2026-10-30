import { APP_NAME } from '~/lib/brand'
import { useTranslation } from 'react-i18next'
import type { Lang } from '~/lib/core/types'
import { formatDate } from '~/lib/format/date'
import { useQuery } from '@tanstack/react-query'
import { describeEntityToken } from '~/lib/filters/entity-token'
import { filterOptionsQueryOptions } from '~/queries/filters.queries'

export interface PrintHeaderProps {
  title: string
  entity?: string
  preset?: string
  asOf?: string
}

export function PrintHeader({ title, entity, preset, asOf }: PrintHeaderProps) {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang
  // The URL holds location ids; print the entity codes instead.
  const { data: filterOptions } = useQuery(filterOptionsQueryOptions())
  const entityInfo = describeEntityToken(entity ?? 'all', filterOptions?.entities ?? [])
  let entityText: string
  if (entityInfo.kind === 'all') entityText = t('ui.shell.allEntitiesPrint')
  else if (entityInfo.kind === 'codes') entityText = entityInfo.codes.join(', ')
  else entityText = t('ui.printHeader.entityCount', { count: entityInfo.count })
  const printTimestamp = new Date().toLocaleString(t('ui.printHeader.enUs'), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="print-only mb-6 pb-4 border-b">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold tracking-tight m-0 text-black">
            {APP_NAME} — {title}
          </h1>
          <p className="text-xs text-neutral-600 mt-1 mb-0">
            {t('ui.printHeader.entity')}:{' '}
            <span className="font-semibold">{entityText}</span>
            {' · '}
            {t('ui.printHeader.period')}:{' '}
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
            {t('ui.printHeader.printedOn')}: {printTimestamp}
          </span>
        </div>
      </div>
    </div>
  )
}
