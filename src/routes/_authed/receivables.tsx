import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { tableSearchSchema } from '~/lib/table/query'
import { AGING_PARTY_SORT_KEYS } from '~/lib/finance/ap-ar/aging-parties'
import { arAgingMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { AgingPage } from '~/components/aging/AgingPage'

export const Route = createFileRoute('/_authed/receivables')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(AGING_PARTY_SORT_KEYS).shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(arAgingMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: ReceivablesPage,
})

function ReceivablesPage() {
  const deps = Route.useLoaderDeps()
  const { data } = useQuery(arAgingMetricOptions(deps))
  const { t } = useTranslation()

  if (!data) return null

  return (
    <AgingPage
      side="ar"
      data={data}
      deps={deps}
      kpis={[
        { label: t('ui.receivables.accountsReceivableNet'), value: data.total, higherIsBetter: true },
        { label: t('ui.receivables.unpaidInvoices'), value: data.unpaidInvoices, higherIsBetter: true },
        { label: t('ui.receivables.totalOverdue'), value: data.overdueSubtotal, higherIsBetter: false },
        { label: t('ui.receivables.nonTradeReceivables'), value: data.nonTrade, higherIsBetter: true },
      ]}
    />
  )
}
