import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BalanceTrendChart } from '~/components/balance-sheet/BalanceTrendChart'
import { Notice } from '~/components/ui/Notice'
import { Skeleton } from '~/components/ui/Skeleton'
import { balanceTrendMetricOptions } from '~/queries/metrics.queries'
import type { MetricInput } from '~/lib/filters/search-schema'
import type { Lang } from '~/lib/core/types'

/** The 12-month trend. It loads after the rest of the page: a skeleton shows until it is ready. */
export function BalanceTrendSection({ input, lang }: { input: MetricInput; lang: Lang }) {
  const { t } = useTranslation()
  const trend = useQuery(balanceTrendMetricOptions(input))

  if (trend.isError) {
    return (
      <Notice
        tone="warning"
        title={t('balanceSheet.trend.failed')}
        action={{ label: t('metric.tryAgain'), onClick: () => void trend.refetch() }}
      />
    )
  }
  if (!trend.data) return <Skeleton className="h-80 rounded-lg" />

  const { points, missingCount } = trend.data
  return (
    <section className="nr-card space-y-3">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{t('balanceSheet.trend.title')}</h3>
      </div>
      {points.length === 0 ? (
        <p className="nr-muted">{t('common.noData')}</p>
      ) : (
        <BalanceTrendChart points={points} lang={lang} />
      )}
      {points.some((point) => point.provisional) && (
        <p className="nr-muted text-xs">{t('balanceSheet.trend.provisionalNote')}</p>
      )}
      {missingCount > 0 && (
        <p className="nr-muted text-xs">{t('balanceSheet.trend.missing', { count: missingCount })}</p>
      )}
    </section>
  )
}
