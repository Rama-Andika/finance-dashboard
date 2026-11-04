import { useQuery } from '@tanstack/react-query'
import { summaryChartsOptions } from '~/queries/metrics.queries'
import { Skeleton } from '~/components/ui/Skeleton'
import { SummaryCharts, type SummaryChartTarget } from '~/components/summary/SummaryCharts'
import { SummarySectionError } from '~/components/summary/SummarySectionError'
import type { MetricInput } from '~/lib/filters/search-schema'
import type { IsoDate, Lang } from '~/lib/core/types'

/** The charts of the Summary. They load after the top row: a skeleton shows until they are ready. */
export function SummaryChartsSection({
  filters,
  asOf,
  lang,
  entityCount,
  onOpen,
}: {
  filters: MetricInput
  asOf: IsoDate
  lang: Lang
  entityCount: number
  onOpen: (to: SummaryChartTarget) => void
}) {
  const charts = useQuery(summaryChartsOptions(filters))

  if (charts.isError) return <SummarySectionError error={charts.error} onRetry={() => void charts.refetch()} />
  if (!charts.data) return <Skeleton className="h-80 rounded-lg" />

  return (
    <SummaryCharts
      asOf={asOf}
      lang={lang}
      entityCount={entityCount}
      cashFlow={charts.data.cashFlow}
      revenueByFolder={charts.data.revenueByFolder}
      expenseFolders={charts.data.expenseFolders}
      fixedCostFolders={charts.data.fixedCostFolders}
      fixedCostBasketEmpty={charts.data.fixedCostBasketEmpty}
      revenueByEntity={charts.data.revenueByEntity}
      entityUnassigned={charts.data.entityUnassigned}
      onOpen={onOpen}
    />
  )
}
