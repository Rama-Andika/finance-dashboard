import { metricLoaderDeps, drillSearchSchema } from '~/lib/filters/search-schema'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { tableSearchSchema } from '~/lib/table/query'
import { AGING_PARTY_SORT_KEYS } from '~/lib/finance/ap-ar/aging-parties'
import { arAgingMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/layout/MetricSkeleton'
import { MetricError } from '~/components/layout/MetricError'
import { AgingPage } from '~/components/aging/AgingPage'
import { useLang } from '~/hooks/use-lang'
import { formatMoneyShort } from '~/lib/format/number'

export const Route = createFileRoute('/_authed/receivables')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(AGING_PARTY_SORT_KEYS).shape),
  loaderDeps: ({ search }) => metricLoaderDeps(search),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(arAgingMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: ReceivablesPage,
})

function ReceivablesPage() {
  const deps = Route.useLoaderDeps()
  const { data } = useQuery(arAgingMetricOptions(deps))
  const { t } = useTranslation()
  const lang = useLang()

  if (!data) return null

  return (
    <AgingPage
      side="ar"
      data={data}
      deps={deps}
      kpis={[
        {
          label: t('ui.receivables.accountsReceivableNet'),
          value: data.total,
          higherIsBetter: true,
          ...(data.directReturnCount > 0
            ? { hint: t('ui.receivables.directReturnsHint', { amount: formatMoneyShort(data.directReturns, lang) }) }
            : {}),
        },
        { label: t('ui.receivables.unpaidInvoices'), value: data.unpaidInvoices, higherIsBetter: true },
        { label: t('ui.receivables.totalOverdue'), value: data.overdueSubtotal, higherIsBetter: false },
        { label: t('ui.receivables.nonTradeReceivables'), value: data.nonTrade, higherIsBetter: true },
      ]}
    />
  )
}
