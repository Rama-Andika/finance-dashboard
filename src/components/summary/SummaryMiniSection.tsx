import { useQuery } from '@tanstack/react-query'
import { summaryMiniOptions } from '~/queries/metrics.queries'
import { Skeleton } from '~/components/ui/Skeleton'
import { MiniMetricsBar } from '~/components/summary/MiniMetricsBar'
import { SummarySectionError } from '~/components/summary/SummarySectionError'
import type { MetricInput } from '~/lib/filters/search-schema'
import type { Lang } from '~/lib/core/types'

/** Runway, margins and current ratio. They load after the top row: a skeleton shows until they are ready. */
export function SummaryMiniSection({ filters, lang }: { filters: MetricInput; lang: Lang }) {
  const mini = useQuery(summaryMiniOptions(filters))

  if (mini.isError) return <SummarySectionError error={mini.error} onRetry={() => void mini.refetch()} />
  if (!mini.data) return <Skeleton className="h-20 rounded-lg" />

  return (
    <MiniMetricsBar
      metrics={{ runway: mini.data.runway, grossMargin: mini.data.grossMargin, netMargin: mini.data.netMargin }}
      lang={lang}
    />
  )
}
