import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { tableSearchSchema } from '~/lib/table/query'
import { AGING_PARTY_SORT_KEYS } from '~/lib/finance/ap-ar/aging-parties'
import { apAgingMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { AgingPage } from '~/components/aging/AgingPage'

export const Route = createFileRoute('/_authed/payables')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(AGING_PARTY_SORT_KEYS).shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(apAgingMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: PayablesPage,
})

function PayablesPage() {
  const deps = Route.useLoaderDeps()
  const { data } = useQuery(apAgingMetricOptions(deps))
  const { t } = useTranslation()

  if (!data) return null

  return (
    <AgingPage
      side="ap"
      data={data}
      deps={deps}
      kpis={[
        { label: t('ui.payables.accountsPayableNet'), value: data.total, higherIsBetter: false },
        { label: t('ui.payables.unpaidBills'), value: data.unpaidBills, higherIsBetter: false },
        { label: t('ui.payables.totalOverdue'), value: data.overdueSubtotal, higherIsBetter: false },
        { label: t('ui.payables.vendorCredits'), value: data.vendorCredits, higherIsBetter: true },
      ]}
    />
  )
}
