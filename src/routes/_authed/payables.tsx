import { metricLoaderDeps, drillSearchSchema } from '~/lib/filters/search-schema'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { tableSearchSchema } from '~/lib/table/query'
import { AGING_PARTY_SORT_KEYS } from '~/lib/finance/ap-ar/aging-parties'
import { apAgingMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/layout/MetricSkeleton'
import { MetricError } from '~/components/layout/MetricError'
import { AgingPage } from '~/components/aging/AgingPage'
import { useLang } from '~/hooks/use-lang'
import { formatMoneyShort } from '~/lib/format/number'

export const Route = createFileRoute('/_authed/payables')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(AGING_PARTY_SORT_KEYS).shape),
  loaderDeps: ({ search }) => metricLoaderDeps(search),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(apAgingMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: PayablesPage,
})

function PayablesPage() {
  const deps = Route.useLoaderDeps()
  const { data } = useQuery(apAgingMetricOptions(deps))
  const { t } = useTranslation()
  const lang = useLang()

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
        {
          label: t('ui.payables.vendorCredits'),
          value: data.vendorCredits,
          higherIsBetter: true,
          ...(data.directReturnCount > 0
            ? { hint: t('ui.payables.directReturnsHint', { amount: formatMoneyShort(data.directReturns, lang) }) }
            : {}),
        },
      ]}
    />
  )
}
