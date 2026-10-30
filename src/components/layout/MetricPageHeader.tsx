import { useTranslation } from 'react-i18next'
import { Notice } from '~/components/neraca/Notice'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatMonthYear } from '~/lib/format/date'
import type { Lang, MetricMeta } from '~/lib/core/types'

/** The part of the global filter the header describes. */
export type HeaderFilter = { entity: string; preset: string; from?: string; to?: string }

/** What every metric page starts with: the print header and the warnings about open or missing months. */
export function MetricPageHeader({
  titleKey,
  filter,
  meta,
  lang,
  showMissingMonths = true,
}: {
  /** i18n key of the page title (nav.*). */
  titleKey: string
  filter: HeaderFilter
  meta: MetricMeta
  lang: Lang
  /** False for pages that do not read the selected months (Payment Plan starts from today). */
  showMissingMonths?: boolean
}) {
  const { t } = useTranslation()
  const preset = filter.from && filter.to ? `${filter.from} – ${filter.to}` : filter.preset
  return (
    <>
      <PrintHeader title={t(titleKey)} entity={filter.entity} preset={preset} asOf={meta.asOf} />
      {meta.hasOpenPeriod && (
        <Notice tone="warning" title={t('metric.openPeriodWarning', { month: formatMonthYear(meta.asOf, lang) })} />
      )}
      {showMissingMonths && meta.missingMonths.length > 0 && (
        <Notice tone="warning" title={t('metric.missingMonthsWarning')} body={meta.missingMonths.join(', ')} />
      )}
    </>
  )
}
